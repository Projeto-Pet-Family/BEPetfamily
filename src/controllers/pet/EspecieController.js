const sqlconnection = require('../../connections/SQLConnections.js')

async function lerEspecie(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const [result] = await sql.query('SELECT * FROM Especie')

        res.status(200).send(result)

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler as espécies, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function inserirEspecie(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { descricao } = req.body

        // Validação básica
        if (!descricao) {
            return res.status(400).json({
                message: 'Descrição é obrigatória'
            })
        }

        // Query direta para inserção
        const [result] = await sql.query(
            'INSERT INTO Especie (descricao) VALUES (?)',
            [descricao]
        )

        res.status(201).json({
            message: 'Espécie criada com sucesso!',
            data: {
                idEspecie: result.insertId,
                descricao
            }
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar a espécie, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function updateEspecie(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idEspecie } = req.params
        const { descricao } = req.body

        // Validação básica
        if (!descricao) {
            return res.status(400).json({
                message: 'Descrição é obrigatória'
            })
        }

        // Query direta para atualização
        const [result] = await sql.query(
            'UPDATE Especie SET descricao = ? WHERE idEspecie = ?',
            [descricao, idEspecie]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Espécie não encontrada'
            })
        }

        res.status(200).json({
            message: 'Espécie atualizada com sucesso!',
            data: {
                idEspecie,
                descricao
            }
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar a espécie, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function deleteEspecie(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idEspecie } = req.params

        // Query direta para exclusão
        const [result] = await sql.query(
            'DELETE FROM Especie WHERE idEspecie = ?',
            [idEspecie]
        )

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Espécie não encontrada'
            })
        }

        res.status(200).json({
            message: 'Espécie deletada com sucesso'
        })

    } catch (error) {
        // Verifica se o erro é de restrição de chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                message: 'Não é possível deletar a espécie pois está sendo utilizada em outros registros'
            })
        }
        
        res.status(500).json({
            message: 'Erro ao deletar a espécie, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

module.exports = {
    lerEspecie,
    inserirEspecie,
    updateEspecie,
    deleteEspecie
}