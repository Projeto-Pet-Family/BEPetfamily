const sqlconnection = require('../../connections/SQLConnections.js')

async function lerPet(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const [result] = await sql.query(`
            SELECT p.*, 
                   u.nome as nomeUsuario,
                   po.descricao as descricaoPorte,
                   e.descricao as descricaoEspecie,
                   r.descricao as descricaoRaca
            FROM Pet p
            LEFT JOIN Usuario u ON p.idUsuario = u.idUsuario
            LEFT JOIN Porte po ON p.idPorte = po.idPorte
            LEFT JOIN Especie e ON p.idEspecie = e.idEspecie
            LEFT JOIN Raca r ON p.idRaca = r.idRaca
        `)

        res.status(200).send(result)

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler os pets, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function lerPetPorId(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idPet } = req.params

        const [result] = await sql.query(`
            SELECT p.*, 
                   u.nome as nomeUsuario,
                   po.descricao as descricaoPorte,
                   e.descricao as descricaoEspecie,
                   r.descricao as descricaoRaca
            FROM Pet p
            LEFT JOIN Usuario u ON p.idUsuario = u.idUsuario
            LEFT JOIN Porte po ON p.idPorte = po.idPorte
            LEFT JOIN Especie e ON p.idEspecie = e.idEspecie
            LEFT JOIN Raca r ON p.idRaca = r.idRaca
            WHERE p.idPet = ?
        `, idPet)

        if (result.length === 0) {
            return res.status(404).json({
                message: 'Pet não encontrado'
            })
        }

        res.status(200).send(result[0])

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler o pet, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function inserirPet(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idUsuario, idPorte, idEspecie, idRaca, nome, sexo, nascimento } = req.body

        // Validação básica dos campos obrigatórios
        if (!sexo || !nascimento) {
            return res.status(400).json({
                message: 'Sexo e nascimento são campos obrigatórios'
            })
        }

        // Query direta para inserção
        const [result] = await sql.query(`
            INSERT INTO Pet 
            (idUsuario, idPorte, idEspecie, idRaca, nome, sexo, nascimento)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            idUsuario || null,
            idPorte || null,
            idEspecie || null,
            idRaca || null,
            nome || null,
            sexo,
            nascimento
        ])

        res.status(201).json({
            message: 'Pet criado com sucesso!',
            data: {
                idPet: result.insertId,
                ...req.body
            }
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar o pet, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function updatePet(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idPet } = req.params
        const { idUsuario, idPorte, idEspecie, idRaca, nome, sexo, nascimento } = req.body

        // Validação básica dos campos obrigatórios
        if (!sexo || !nascimento) {
            return res.status(400).json({
                message: 'Sexo e nascimento são campos obrigatórios'
            })
        }

        // Query direta para atualização
        await sql.query(`
            UPDATE Pet SET
                idUsuario = ?,
                idPorte = ?,
                idEspecie = ?,
                idRaca = ?,
                nome = ?,
                sexo = ?,
                nascimento = ?
            WHERE idPet = ?
        `, [
            idUsuario || null,
            idPorte || null,
            idEspecie || null,
            idRaca || null,
            nome || null,
            sexo,
            nascimento,
            idPet
        ])

        res.status(200).json({
            message: 'Pet atualizado com sucesso!',
            data: {
                idPet,
                ...req.body
            }
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar o pet, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

async function deletePet(req, res) {
    let sql
    try {
        sql = await sqlconnection()

        const { idPet } = req.params

        // Query direta para exclusão
        await sql.query('DELETE FROM Pet WHERE idPet = ?', idPet)

        res.status(200).json({
            message: 'Pet deletado com sucesso',
        })

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao deletar o pet, confira o console'
        })
        console.log(error)
    } finally {
        if (sql) {
            await sql.end()
        }
    }
}

module.exports = {
    lerPet,
    lerPetPorId,
    inserirPet,
    updatePet,
    deletePet
}