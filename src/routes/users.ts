import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm"
import express from "express"
import { user } from "../db/schema"
import { db } from "../db"

const router = express.Router()
const validRoles = ['student', 'teacher', 'admin'] as const

// GET all users with opt search, filtering and pagination
router.get('/', async (req, res) => {
    try {
        const { search, role, page = 1, limit = 10 } = req.query

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1)
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100)

        const offset = (currentPage - 1) * limitPerPage

        const filterConditions = []

        // If search query exists, filter by user name OR user email
        if (search) {
            filterConditions.push(
                or(
                    ilike(user.name, `%${search}%`),
                    ilike(user.email, `%${search}%`),
                )
            )
        }

        // If role filter exists, match exact role value
        if (role) {
            const roleValue = String(role)

            if (validRoles.includes(roleValue as (typeof validRoles)[number])) {
                filterConditions.push(eq(user.role, roleValue as (typeof validRoles)[number]))
            }
        }

        // Combine filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .where(whereClause)

        const totalCount = countResult[0]?.count ?? 0

        const usersList = await db
            .select({
                ...getTableColumns(user),
            })
            .from(user)
            .where(whereClause)
            .orderBy(desc(user.createdAt))
            .limit(limitPerPage)
            .offset(offset)

        // Final data
        res.status(200).json({
            data: usersList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage)
            }
        })
    } catch (error) {
        console.error(`GET /users error: ${error}`)
        return res.status(500).json({ error: 'Failed to get users' })
    }
})

export default router
