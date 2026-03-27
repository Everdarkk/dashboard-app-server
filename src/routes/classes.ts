import express from 'express'
import { db } from '../db/index'
import { classes } from '../db/schema/index'
import { auth } from '../lib/auth'
import { fromNodeHeaders } from 'better-auth/node'

const router = express.Router()

router.post('/', async (req, res) => {
    try {
        const session = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers),
        })

        // Whitelist request body props to avoid mass-assignment of sensitive fields.
        const {
            name,
            subjectId,
            description,
            capacity,
            bannerCldPubId,
            bannerUrl,
        } = req.body ?? {}

        const teacherId = session?.user?.id

        if (!teacherId) {
            return res.status(401).json({ error: 'Unauthorized: Could not determine teacher ID.' })
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