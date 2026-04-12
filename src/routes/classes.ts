import express from 'express'
import { db } from '../db/index'
import { classes, classStatusEnum, subjects } from '../db/schema/index'
import { auth } from '../lib/auth'
import { fromNodeHeaders } from 'better-auth/node'
import { and, desc, eq, getTableColumns, gte, ilike, lte, sql } from 'drizzle-orm'
import { user } from '../db/schema/auth'

const router = express.Router()

// GET all classes with optional search, status filter, and pagination
router.get('/', async (req, res) => {
    try {
        const {
            search,
            status,
            subject,
            subjectId,
            teacherId,
            capacityMin,
            capacityMax,
            page = 1,
            limit = 10,
        } = req.query

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1)
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100)

        const offset = (currentPage - 1) * limitPerPage

        const filterConditions = []

        // Filter by class name
        if (search) {
            filterConditions.push(ilike(classes.name, `%${search}%`))
        }

        // Filter by status — validate against known enum values to prevent injection
        if (status) {
            const statusValue = String(status)
            if ((classStatusEnum.enumValues as readonly string[]).includes(statusValue)) {
                filterConditions.push(
                    eq(classes.status, statusValue as (typeof classStatusEnum.enumValues)[number])
                )
            }
        }

        // Filter by subject name (partial match, escape wildcards)
        if (subject) {
            const subjectPattern = `%${String(subject).replace(/[%_]/g, '\\$&')}%`
            filterConditions.push(ilike(subjects.name, subjectPattern))
        }

        // Filter by subject id (exact match)
        if (subjectId) {
            const parsedSubjectId = Number(subjectId)
            if (Number.isInteger(parsedSubjectId) && parsedSubjectId > 0) {
                filterConditions.push(eq(classes.subjectId, parsedSubjectId))
            }
        }

        // Filter by teacher id (exact match)
        if (teacherId) {
            const normalizedTeacherId = String(teacherId).trim()
            if (normalizedTeacherId) {
                filterConditions.push(eq(classes.teacherId, normalizedTeacherId))
            }
        }

        // Filter by capacity min/max (inclusive)
        if (capacityMin) {
            const parsedCapacityMin = Number(capacityMin)
            if (Number.isFinite(parsedCapacityMin) && parsedCapacityMin >= 0) {
                filterConditions.push(gte(classes.capacity, Math.floor(parsedCapacityMin)))
            }
        }

        if (capacityMax) {
            const parsedCapacityMax = Number(capacityMax)
            if (Number.isFinite(parsedCapacityMax) && parsedCapacityMax >= 0) {
                filterConditions.push(lte(classes.capacity, Math.floor(parsedCapacityMax)))
            }
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .where(whereClause)

        const totalCount = countResult[0]?.count ?? 0

        const classesList = await db
            .select({
                ...getTableColumns(classes),
                subject: {
                    id: subjects.id,
                    name: subjects.name,
                    code: subjects.code,
                },
                teacher: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                },
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(classes.created_at))
            .limit(limitPerPage)
            .offset(offset)

        res.status(200).json({
            data: classesList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        })
    } catch (error) {
        console.error(`GET /classes error: ${error}`)
        return res.status(500).json({ error: 'Failed to get classes' })
    }
})

router.post('/', async (req, res) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        })

        const sessionUser = session?.user as { id?: string; role?: string } | undefined

        // Whitelist request body props to avoid mass-assignment of sensitive fields.
        const {
            name,
            subjectId,
            description,
            capacity,
            bannerCldPubId,
            bannerUrl,
            teacherId: teacherIdFromBody,
        } = req.body ?? {}

        const normalizedTeacherIdFromBody =
            typeof teacherIdFromBody === 'string' ? teacherIdFromBody.trim() : ''

        const isAdminSession = sessionUser?.role === 'admin'
        const canUseRequestedTeacherId = Boolean(
            normalizedTeacherIdFromBody && (!sessionUser?.id || isAdminSession || sessionUser.id === normalizedTeacherIdFromBody)
        )

        const teacherId = canUseRequestedTeacherId
            ? normalizedTeacherIdFromBody
            : sessionUser?.id

        if (!teacherId) {
            return res.status(401).json({ error: 'Unauthorized: Could not determine teacher ID.' })
        }

        if (
            normalizedTeacherIdFromBody &&
            sessionUser?.id &&
            normalizedTeacherIdFromBody !== sessionUser.id &&
            !isAdminSession
        ) {
            return res.status(403).json({
                error: 'Forbidden: Only admin users can create classes for another teacher.',
            })
        }

        const [teacherRecord] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, teacherId))
            .limit(1)

        if (!teacherRecord) {
            return res.status(400).json({ error: 'Invalid teacherId: user was not found.' })
        }

        if (teacherRecord.role !== 'teacher' && teacherRecord.role !== 'admin') {
            return res.status(400).json({ error: 'Invalid teacherId: selected user is not a teacher.' })
        }

        if (!name || !subjectId || !description || !capacity) {
            return res.status(400).json({
                error: 'Missing required fields: name, subjectId, description, capacity',
            })
        }

        const [createdClass] = await db
            .insert(classes)
            .values({
                name: String(name),
                subjectId: Number(subjectId),
                description: String(description),
                capacity: Number(capacity),
                bannerCldPubId: bannerCldPubId ? String(bannerCldPubId) : null,
                bannerUrl: bannerUrl ? String(bannerUrl) : null,
                teacherId,
                inviteCode: Math.random().toString(36).substring(2, 9),
                schedules: [],
            })
            .returning({ id: classes.id })

        if(!createdClass) throw new Error('Failed to create class')
            
        res.status(201).json({ data: createdClass })
    } catch (error) {
        console.error(`POST /classes error: ${error}`)
        res.status(500).json({ error: 'Failed to create class' })
    }
})

export default router