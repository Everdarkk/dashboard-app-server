import 'dotenv/config'
import { db } from './index'
import { departments } from './schema'

// Mirrors the DEPARTMENTS constant in the client (dashboard-app-client/src/constants/index.ts).
// code must be unique — abbreviations chosen to match standard academic conventions.
const DEPARTMENT_SEED_DATA = [
    { code: 'CS',   name: 'Computer Science',        description: 'Study of computation, algorithms, and software systems.' },
    { code: 'MATH', name: 'Mathematics',              description: 'Study of numbers, quantity, structure, space, and change.' },
    { code: 'PHYS', name: 'Physics',                  description: 'Study of matter, energy, and the fundamental forces of nature.' },
    { code: 'CHEM', name: 'Chemistry',                description: 'Study of substances, their properties, reactions, and uses.' },
    { code: 'BIO',  name: 'Biology',                  description: 'Study of living organisms and life processes.' },
    { code: 'ENGL', name: 'English',                  description: 'Study of language, literature, composition, and communication.' },
    { code: 'HIST', name: 'History',                  description: 'Study of past events and human civilizations.' },
    { code: 'GEO',  name: 'Geography',                description: 'Study of Earth\'s landscapes, environments, and places.' },
    { code: 'ECON', name: 'Economics',                description: 'Study of production, distribution, and consumption of goods.' },
    { code: 'BA',   name: 'Business Administration',  description: 'Study of business operations, management, and strategy.' },
    { code: 'ENGR', name: 'Engineering',              description: 'Application of science and math to design and build systems.' },
    { code: 'PSY',  name: 'Psychology',               description: 'Study of human behavior and mental processes.' },
    { code: 'SOC',  name: 'Sociology',                description: 'Study of society, social relationships, and institutions.' },
    { code: 'POLS', name: 'Political Science',        description: 'Study of political systems, governance, and power.' },
    { code: 'PHIL', name: 'Philosophy',               description: 'Study of fundamental questions about existence and knowledge.' },
    { code: 'EDU',  name: 'Education',                description: 'Study of teaching, learning, and educational systems.' },
    { code: 'FA',   name: 'Fine Arts',                description: 'Study of visual arts, design, and creative expression.' },
    { code: 'MUS',  name: 'Music',                    description: 'Study of musical theory, performance, and composition.' },
    { code: 'PE',   name: 'Physical Education',       description: 'Study of physical fitness, sports, and health.' },
    { code: 'LAW',  name: 'Law',                      description: 'Study of legal systems, statutes, and jurisprudence.' },
] as const

async function seed() {
    console.log('Seeding departments...')

    // onConflictDoNothing makes the script safe to re-run at any time.
    const inserted = await db
        .insert(departments)
        .values(DEPARTMENT_SEED_DATA.map((d) => ({ ...d })))
        .onConflictDoNothing()
        .returning({ id: departments.id, name: departments.name, code: departments.code })

    if (inserted.length === 0) {
        console.log('All departments already exist — nothing to insert.')
    } else {
        console.log(`Inserted ${inserted.length} department(s):`)
        inserted.forEach((d) => console.log(`  [${d.code}] ${d.name}`))
    }

    console.log('Seeding complete.')
    process.exit(0)
}

seed().catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
})
