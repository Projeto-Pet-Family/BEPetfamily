const sqlconnection = require('../../connections/SQLConnections.js')

async function lerRaca(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const [result] = await sql.query(`
            SELECT r.*, e.descricao as descricaoEspecie 
            FROM Raca r
            JOIN Especie e ON r.idEspecie = e.idEspecie
        `)

        res.status(200).send(result)

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler as raças, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function lerRacaPorEspecie(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idEspecie } = req.params

        const [result] = await sql.query(`
            SELECT r.*, e.descricao as descricaoEspecie 
            FROM Raca r
            JOIN Especie e ON r.idEspecie = e.idEspecie
            WHERE r.idEspecie = ?
        `, [idEspecie])

        res.status(200).send(result)

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler as raças por espécie, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function inserirRaca(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { descricao, idEspecie } = req.body

        // Validações
        if (!descricao || !idEspecie) {
            return res.status(400).json({
                message: 'Descrição e ID da espécie são obrigatórios'
            })
        }

        // Verifica se a espécie existe
        const [especie] = await sql.query('SELECT 1 FROM Especie WHERE idEspecie = ?', [idEspecie])
        if (!especie.length) {
            return res.status(400).json({
                message: 'Espécie não encontrada'
            })
        }

        // Query direta para inserção
        const [result] = await sql.query(
            'INSERT INTO Raca (descricao, idEspecie) VALUES (?, ?)',
            [descricao, idEspecie]
        )

        res.status(201).json({
            message: 'Raça criada com sucesso!',
            data: {
                idRaca: result.insertId,
                descricao,
                idEspecie
            }
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar a raça, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function updateRaca(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idRaca } = req.params
        const { descricao, idEspecie } = req.body

        // Validações
        if (!descricao || !idEspecie) {
            return res.status(400).json({
                message: 'Descrição e ID da espécie são obrigatórios'
            })
        }

        // Verifica se a espécie existe
        const [especie] = await sql.query('SELECT 1 FROM Especie WHERE idEspecie = ?', [idEspecie])
        if (!especie.length) {
            return res.status(400).json({
                message: 'Espécie não encontrada'
            })
        }

        // Query direta para atualização
        const [result] = await sql.query(
            'UPDATE Raca SET descricao = ?, idEspecie = ? WHERE idRaca = ?',
            [descricao, idEspecie, idRaca]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Raça não encontrada'
            })
        }

        res.status(200).json({
            message: 'Raça atualizada com sucesso!',
            data: {
                idRaca,
                descricao,
                idEspecie
            }
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar a raça, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function deleteRaca(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idRaca } = req.params

        // Query direta para exclusão
        const [result] = await sql.query(
            'DELETE FROM Raca WHERE idRaca = ?',
            [idRaca]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Raça não encontrada'
            })
        }

        res.status(200).json({
            message: 'Raça deletada com sucesso'
        })

    } catch (error) {
        // Verifica se o erro é de restrição de chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                message: 'Não é possível deletar a raça pois está sendo utilizada em outros registros'
            })
        }
        
        res.status(500).json({
            message: 'Erro ao deletar a raça, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

module.exports = {
    lerRaca,
    lerRacaPorEspecie,
    inserirRaca,
    updateRaca,
    deleteRaca
}