const sqlconnection = require('../../connections/SQLConnections.js')

async function lerPorte(req, res) {
    let sql
    try {
        sql = await sqlconnection()
        const [result] = await sql.query('SELECT * FROM Porte ORDER BY descricao')
        res.status(200).send(result)
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler os portes',
            error: error.message
        })
        console.error('Erro ao ler portes:', error)
    } finally {
        if (sql) await sql.end()
    }
}

async function inserirPorte(req, res) {
    let sql
    try {
        sql = await sqlconnection()
        const { descricao } = req.body

        // Validação
        if (!descricao || descricao.trim() === '') {
            return res.status(400).json({
                message: 'Descrição do porte é obrigatória'
            })
        }

        // Query direta
        const [result] = await sql.query(
            'INSERT INTO Porte (descricao) VALUES (?)',
            [descricao.trim()]
        )

        res.status(201).json({
            message: 'Porte criado com sucesso!',
            data: {
                idPorte: result.insertId,
                descricao: descricao.trim()
            }
        })

    } catch (error) {
        // Tratamento para duplicados
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um porte com esta descrição'
            })
        }

        res.status(500).json({
            message: 'Erro ao criar porte',
            error: error.message
        })
        console.error('Erro ao criar porte:', error)
    } finally {
        if (sql) await sql.end()
    }
}

async function updatePorte(req, res) {
    let sql
    try {
        sql = await sqlconnection()
        const { idPorte } = req.params
        const { descricao } = req.body

        // Validação
        if (!descricao || descricao.trim() === '') {
            return res.status(400).json({
                message: 'Descrição do porte é obrigatória'
            })
        }

        // Query direta
        const [result] = await sql.query(
            'UPDATE Porte SET descricao = ? WHERE idPorte = ?',
            [descricao.trim(), idPorte]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Porte não encontrado'
            })
        }

        res.status(200).json({
            message: 'Porte atualizado com sucesso!',
            data: {
                idPorte,
                descricao: descricao.trim()
            }
        })

    } catch (error) {
        // Tratamento para duplicados
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um porte com esta descrição'
            })
        }

        res.status(500).json({
            message: 'Erro ao atualizar porte',
            error: error.message
        })
        console.error('Erro ao atualizar porte:', error)
    } finally {
        if (sql) await sql.end()
    }
}

async function deletePorte(req, res) {
    let sql
    try {
        sql = await sqlconnection()
        const { idPorte } = req.params

        // Query direta
        const [result] = await sql.query(
            'DELETE FROM Porte WHERE idPorte = ?',
            [idPorte]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Porte não encontrado'
            })
        }

        res.status(200).json({
            message: 'Porte removido com sucesso'
        })

    } catch (error) {
        // Tratamento para chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                message: 'Não é possível remover o porte pois está sendo utilizado'
            })
        }

        res.status(500).json({
            message: 'Erro ao remover porte',
            error: error.message
        })
        console.error('Erro ao remover porte:', error)
    } finally {
        if (sql) await sql.end()
    }
}

module.exports = {
    lerPorte,
    inserirPorte,
    updatePorte,
    deletePorte
}