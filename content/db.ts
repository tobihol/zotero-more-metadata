declare const Zotero: any
const DB_NAME = 'more-metadata'
const PAPER_TABLE_NAME = 'papers'
const AUTHOR_TABLE_NAME = 'authors'

async function openDB() {
    // establish connection
    const conn = new Zotero.DBConnection(DB_NAME)
    // create table if needed
    await conn.queryAsync(
        `CREATE TABLE IF NOT EXISTS "${PAPER_TABLE_NAME}" (
         DOI TEXT PRIMARY KEY NOT NULL)`
    )
    return conn
}

// function flattenRec(obj) {
//     const res = JSON.parse(JSON.stringify(obj))
//     for (const key of Object.keys(res)) {
//         let value = res[key]
//         const tp = typeof value
//         if (tp === 'object') {
//             value = flatten(value)
//             for (const nestedKey of Object.keys(value)) {
//                 res[`${key}.${nestedKey}`] = value[nestedKey]
//             }
//             delete res[key]
//         }
//     }
//     return res
// }

// function unflattenRec(obj) {
//     const res = {}
//     for (const flatKey of Object.keys(obj)) {
//         const keys = flatKey.split('.')
//         keys.reduce((r, e, j) => r[e] || (r[e] = isNaN(Number(keys[j + 1])) ? (keys.length - 1 === j ? obj[flatKey] : {}) : []), res)
//     }
//     return res
// }

function flatten(obj: 'object') {
    const res = {}
    for (const key of Object.keys(obj)) {
        const value = obj[key]
        switch (typeof value) {
            case 'object':
                // res[key] = `${JSON.stringify(value)}`
                res[key] = null
                break
            case 'string':
                res[key] = value
                break
            default:
                res[key] = `${value}` // TODO no way this is what you should do
                break
        }
    }
    return res
}

function unflatten(obj) {
    // const res = {}
    // for (const key of Object.keys(obj)) {
    //     const value = obj[key]
    //     try {
    //         res[key] = JSON.parse(value)
    //     } catch {
    //         res [key] = value
    //     }
    // }
    return obj
}

async function writeItemToDB(conn, mmItem) {
    const flatItem = flatten(mmItem)

    // add columns if needed
    await conn.executeTransaction(async () => {
        const currColumns = await conn.getColumns(PAPER_TABLE_NAME)
        for (const key in flatItem) {
            if (currColumns.includes(key)) continue
            await conn.queryAsync(
                `ALTER TABLE "${PAPER_TABLE_NAME}" ADD COLUMN "${key}" TEXT;`
            )
        }
        const columns = JSON.stringify(Object.keys(flatItem)).slice(1, -1)
        const values = JSON.stringify(Object.values(flatItem)).slice(1, -1)
        await conn.queryAsync(
            `INSERT OR REPLACE INTO ${PAPER_TABLE_NAME} (${columns}) VALUES(${values})`
        )
    })
}

export async function writeItemsToDB(mmItems) {
    const conn = await openDB()
    for (const mmItem of mmItems) {
        try {
            await writeItemToDB(conn, mmItem)
        } catch (error) {
            Zotero.debug(`writeItems Error: ${error}`)
        }
    }
    await conn.closeDatabase()
}

export async function readAllItemsFromDB() {
    const conn = await openDB()
    let res = null
    try {
        await conn.executeTransaction(async () => {
            // res = await conn.valueQueryAsync(
            //     `SELECT *
            //     FROM ${PAPER_TABLE_NAME}
            //     WHERE CoolNewColumn="someValue"`)

            // res = await conn.columnQueryAsync(
            //     `SELECT *
            //     FROM ${PAPER_TABLE_NAME}`
            //     )

            // TODO this is a workaround, because queryAsync doesn't seem to work with SELECT...
            const columns = await conn.getColumns(PAPER_TABLE_NAME)
            // Zotero.debug(`columns: ${columns}`)
            const nRows = await conn.valueQueryAsync(
                `SELECT COUNT (*)
                FROM ${PAPER_TABLE_NAME}`)
            // Zotero.debug(`nrows: ${nRows}`)
            res = []
            for (let i = 0; i < nRows; i++) {
                res.push({})
            }

            for (const column of columns) {
                // Zotero.debug(`column: ${column}`)
                const columnValues = await conn.columnQueryAsync(
                    `SELECT ${column}
                FROM ${PAPER_TABLE_NAME}
                ORDER BY DOI ASC`
                )
                for (const row of Object.keys(columnValues)) {
                    // Zotero.debug(`row: ${row}`)
                    res[row][column] = columnValues[row]
                }
            }

            // res = await conn.rowQueryAsync(
            //     `SELECT CoolNewColumn
            //     FROM ${PAPER_TABLE_NAME}
            //     WHERE CoolNewColumn="someValue"`
            //     )

            // let rows = await conn.queryAsync(`SELECT * FROM ${PAPER_TABLE_NAME}`);
            // for (let i=0; i<rows.length; i++) {
            //     let row = rows[i];
            //     // row.foo == 'a', row.bar == 1
            //     // row.foo == 'b', row.bar == 2
            //     // row.foo == 'c', row.bar == 3
            //     // row.foo == 'd', row.bar == 4
            // }

            // res = rows;
        })
    } catch (error) {
        Zotero.debug(`getTable Error: ${error}`)
    }
    await conn.closeDatabase()
    return unflatten(res)
}

export async function deleteEntriesByDOI(dois) {
    const conn = await openDB()
    try {
        for (const doi of dois) {
            // TODO write this as one query instead of multiple
            await conn.queryAsync(
                `DELETE FROM ${PAPER_TABLE_NAME}
                WHERE DOI="${doi}"`)
        }
    } catch (error) {
        Zotero.debug(`DeleteEntries Error: ${error}`)
    }
    await conn.closeDatabase()
}

// return await writeItems([{ "DOI": "testDOI", "CoolNewColumn": "someValue" }])
// return await getTable()
// return await deleteEntriesByDOI(['doi100','testDOI3'])
