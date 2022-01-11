declare const Zotero: any
const DB_NAME = 'more-metadata'
const PAPER_TABLE_NAME = 'papers'
const AUTHOR_TABLE_NAME = 'authors'

export class DBConnection {
    private conn = new Zotero.DBConnection(DB_NAME)

    public async createTable() {
        await this.conn.queryAsync(
            `CREATE TABLE IF NOT EXISTS "${PAPER_TABLE_NAME}" (
             itemID TEXT PRIMARY KEY NOT NULL,
             data TEXT
             )`
        )
    }

    public async check() {
        try {
            await this.conn.integrityCheck()
        } catch (error) {
            Zotero.alert(null, 'MAS MetaData', error)
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
            WHERE itemID IN (${idString})
            `)
        })
        const res = queryRes.map(entry => ({ itemID: entry.itemID, data: JSON.parse(entry.data) }))
        return res
    }

    public async readAllItemsFromDB() {
        const res = {}
        const queryRes = await this.conn.queryAsync(`SELECT * FROM ${PAPER_TABLE_NAME}`)
        for (const row of queryRes) {
            res[row.itemID] = JSON.parse(row.data)
        }
        return res
    }

    public async deleteEntriesByIDs(ids: string[]) {
        const idString = JSON.stringify(ids).slice(1, -1)
        await this.conn.executeTransaction(async () => {
            await this.conn.queryAsync(
                `DELETE FROM ${PAPER_TABLE_NAME}
                WHERE itemID IN (${idString})`)
        })
    }

    public async deleteEntriesOtherThanIDs(ids: string[]) {
        const idString = JSON.stringify(ids).slice(1, -1)
        await this.conn.executeTransaction(async () => {
            await this.conn.queryAsync(
                `DELETE FROM ${PAPER_TABLE_NAME}
                WHERE itemID NOT IN (${idString})`)
        })
    }

    public async getAllIDs() {
        return await this.conn.columnQueryAsync((`SELECT itemID FROM ${PAPER_TABLE_NAME}`))
    }

    private async writeItemToDB(mmItem: { itemID: string, data: JSON }) {
        const stringData = JSON.stringify(mmItem.data)
        await this.conn.queryAsync(
            `INSERT OR REPLACE INTO ${PAPER_TABLE_NAME} (itemID, data) VALUES(?, ?)`,
            [mmItem.itemID, stringData]
        )
    }

}
