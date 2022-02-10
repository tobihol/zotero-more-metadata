declare const Zotero: any
const DB_NAME = 'more-metadata'
const PAPER_TABLE_NAME = 'papers'

export class DBConnection {
    private conn = new Zotero.DBConnection(DB_NAME)

    public async createTable() {
        await this.conn.queryAsync(
            `CREATE TABLE IF NOT EXISTS "${PAPER_TABLE_NAME}" (
             itemId TEXT PRIMARY KEY NOT NULL,
             data TEXT
             )`
        )
    }

    public async check() {
        try {
            await this.conn.integrityCheck()
        } catch (error) {
            Zotero.logError(error)
        }
    }

    public close() {
        this.conn.closeDatabase()
    }

    public async writeItemsToDB(mmItems) {
        await this.conn.executeTransaction(async () => {
            for (const mmItem of mmItems) {
                await this.writeItemToDB(mmItem)
            }
        })
    }

    public async readItemsFromDB(ids: string[]): Promise<any[]> {
        const idString = JSON.stringify(ids).slice(1, -1)
        let queryRes = null
        await this.conn.executeTransaction(async () => {
            queryRes = await this.conn.queryAsync(
                `SELECT * 
            FROM ${PAPER_TABLE_NAME}
            WHERE itemId IN (${idString})
            `)
        })
        const res = queryRes.map(entry => ({ itemId: entry.itemId, data: JSON.parse(entry.data) }))
        return res
    }

    public async readAllItemsFromDB() {
        const res = {}
        const queryRes = await this.conn.queryAsync(`SELECT * FROM ${PAPER_TABLE_NAME}`)
        for (const row of queryRes) {
            res[row.itemId] = JSON.parse(row.data)
        }
        return res
    }

    public async deleteEntriesByIDs(ids: string[]) {
        const idString = JSON.stringify(ids).slice(1, -1)
        await this.conn.executeTransaction(async () => {
            await this.conn.queryAsync(
                `DELETE FROM ${PAPER_TABLE_NAME}
                WHERE itemId IN (${idString})`)
        })
    }

    public async deleteEntriesOtherThanIDs(ids: string[]) {
        const idString = JSON.stringify(ids).slice(1, -1)
        await this.conn.executeTransaction(async () => {
            await this.conn.queryAsync(
                `DELETE FROM ${PAPER_TABLE_NAME}
                WHERE itemId NOT IN (${idString})`)
        })
    }

    public async getAllIDs() {
        return await this.conn.columnQueryAsync((`SELECT itemId FROM ${PAPER_TABLE_NAME}`))
    }

    private async writeItemToDB(mmItem: { itemId: string, data: JSON }) {
        const stringData = JSON.stringify(mmItem.data)
        await this.conn.queryAsync(
            `INSERT OR REPLACE INTO ${PAPER_TABLE_NAME} (itemId, data) VALUES(?, ?)`,
            [mmItem.itemId, stringData]
        )
    }

}
