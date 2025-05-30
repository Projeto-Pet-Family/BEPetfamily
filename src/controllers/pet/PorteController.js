const sqlconnection = require('../../connections/SQLConnections.js')

async function lerPorte(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const [result] = await sql.query('SELECT * FROM Porte')

        res.status(200).send(result)

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler os portes, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function inserirPorte(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { descricao } = req.body

        await sql.query('CALL InsertPorte(?)', descricao)

        res.status(201).json({
            message: 'Porte criado com sucesso!',
            data: descricao
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar o porte, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function updatePorte(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idPorte } = req.params
        const { descricao } = req.body

        await sql.query('CALL UpdatePorte(?, ?)', [idPorte, descricao])

        res.status(200).json({
            message: 'Porte atualizado com sucesso!',
            data: {
                idPorte,
                descricao
            }
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar o porte, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function deletePorte(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idPorte } = req.params

        await sql.query('CALL DeletePorte(?)', idPorte)

        res.status(200).json({
            message: 'Porte deletado com sucesso',
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao deletar o porte, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

module.exports = {
    lerPorte,
    inserirPorte,
    updatePorte,
    deletePorte
}