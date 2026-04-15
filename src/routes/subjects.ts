import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm"
import express from "express"
import { departments, subjects } from "../db/schema"
import { db } from "../db"

const router = express.Router()

// GET all subjects with optional search, filtering and pagination
router.get('/', async (req, res) => {
    try {
        const { search, department, departmentId, page = 1, limit = 10 } = req.query

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1)
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100)

        const offset = (currentPage - 1) * limitPerPage

        const filterConditions = []

        // Filter by subject name OR code (partial match)
        if (search) {
            filterConditions.push(
                or(
                    ilike(subjects.name, `%${search}%`),
                    ilike(subjects.code, `%${search}%`),
                )
            )
        }

        // Filter by department name (partial match, escape wildcards)
        if (department) {
            const deptPattern = `%${String(department).replace(/[%_]/g, '\\$&')}%`
            filterConditions.push(ilike(departments.name, deptPattern))
        }

        // Filter by department ID (exact match)
        if (departmentId) {
            const parsedDeptId = Number(departmentId)
            if (Number.isInteger(parsedDeptId) && parsedDeptId > 0) {
                filterConditions.push(eq(subjects.departmentId, parsedDeptId))
            }
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)

        const totalCount = countResult[0]?.count ?? 0

        const subjectsList = await db
            .select({
                ...getTableColumns(subjects),
                department: { ...getTableColumns(departments) },
            })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(whereClause)
            .orderBy(desc(subjects.created_at))
            .limit(limitPerPage)
            .offset(offset)

        res.status(200).json({
            data: subjectsList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        })
    } catch (error) {
        console.error(`GET /subjects error: ${error}`)
        return res.status(500).json({ error: 'Failed to get subjects' })
    }
})

// POST create a new subject
router.post('/', async (req, res) => {
    try {
        // TODO: re-enable auth + role guard (teacher/admin only) once auth flow is wired up

        const SUBJECT_NAME_MAX = 50
        const SUBJECT_CODE_MAX = 50
        const SUBJECT_DESCRIPTION_MAX = 255
        const DEPARTMENT_NAME_MAX = 50

        // Whitelist body props to prevent mass-assignment
        const { name, code, description, department } = req.body ?? {}

        const normalizedName = String(name).trim()
        const normalizedCode = String(code).trim()
        const normalizedDescription = String(description).trim()
        const normalizedDepartment = String(department).trim()

        // Validate required fields after normalization so whitespace-only values are rejected.
        if (!normalizedName || !normalizedCode || !normalizedDescription || !normalizedDepartment) {
            return res.status(400).json({
                error: 'Missing required fields: name, code, description, department',
            })
        }

        if (normalizedName.length > SUBJECT_NAME_MAX) {
            return res.status(400).json({
                error: `Invalid name: maximum length is ${SUBJECT_NAME_MAX} characters.`,
            })
        }

        if (normalizedCode.length > SUBJECT_CODE_MAX) {
            return res.status(400).json({
                error: `Invalid code: maximum length is ${SUBJECT_CODE_MAX} characters.`,
            })
        }

        if (normalizedDescription.length > SUBJECT_DESCRIPTION_MAX) {
            return res.status(400).json({
                error: `Invalid description: maximum length is ${SUBJECT_DESCRIPTION_MAX} characters.`,
            })
        }

        if (normalizedDepartment.length > DEPARTMENT_NAME_MAX) {
            return res.status(400).json({
                error: `Invalid department: maximum length is ${DEPARTMENT_NAME_MAX} characters.`,
            })
        }

        // Resolve department by name (case-insensitive exact match — no wildcards)
        const [departmentRecord] = await db
            .select({ id: departments.id, name: departments.name })
            .from(departments)
            .where(ilike(departments.name, normalizedDepartment))
            .limit(1)

        if (!departmentRecord) {
            return res.status(400).json({
                error: `Invalid department: "${normalizedDepartment}" was not found.`,
            })
        }

        // Guard against duplicate subject code (friendly error before DB raises it)
        const [existingCode] = await db
            .select({ id: subjects.id })
            .from(subjects)
            .where(ilike(subjects.code, normalizedCode))
            .limit(1)

        if (existingCode) {
            return res.status(409).json({
                error: `Subject code "${normalizedCode}" already exists. Please use a unique code.`,
            })
        }

        const [createdSubject] = await db
            .insert(subjects)
            .values({
                name: normalizedName,
                code: normalizedCode,
                description: normalizedDescription,
                departmentId: departmentRecord.id,
            })
            .returning()

        if (!createdSubject) throw new Error('Insert returned no rows.')

        res.status(201).json({ data: createdSubject })
    } catch (error) {
        // Handle DB-level unique-constraint violation as a fallback
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code: unknown }).code === '23505'
        ) {
            return res.status(409).json({ error: 'Subject code already exists.' })
        }

        console.error(`POST /subjects error: ${error}`)
        res.status(500).json({ error: 'Failed to create subject' })
    }
})

export default router
