import express from 'express'
import { db } from '../db/index'
import { classes } from '../db/schema/index'
import { auth } from '../lib/auth'
import { fromNodeHeaders } from 'better-auth/node'
import { eq } from 'drizzle-orm'
import { user } from '../db/schema/auth'

const router = express.Router()

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