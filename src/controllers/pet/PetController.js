const pool = require('../../connections/SQLConnections.js');

async function lerPet(req, res) {
    let client;
    try {
        client = await pool.connect();

        const result = await client.query(`
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
        `);

        res.status(200).send(result.rows);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler os pets, confira o console'
        });
        console.log('Erro detalhado:', error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function lerPetPorId(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idPet } = req.params;

        const result = await client.query(`
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
            WHERE p.idPet = $1
        `, [idPet]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Pet não encontrado'
            });
        }

        res.status(200).send(result.rows[0]);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao ler o pet, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function inserirPet(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idusuario, idporte, idespecie, idraca, nome, sexo, nascimento } = req.body;

        // Validação básica dos campos obrigatórios
        if (!nome || !sexo || !idusuario || !idporte || !idespecie || !idraca) {
            return res.status(400).json({
                message: 'Nome, sexo, idusuario, idporte, idespecie e idraca são campos obrigatórios'
            });
        }

        // Query para inserção com RETURNING para obter o ID gerado
        const result = await client.query(`
            INSERT INTO Pet 
            (idusuario, idporte, idespecie, idraca, nome, sexo, nascimento)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            idusuario || null,
            idporte || null,
            idespecie || null,
            idraca || null,
            nome || null,
            sexo,
            nascimento
        ]);

        res.status(201).json({
            message: 'Pet criado com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar o pet, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function updatePet(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idPet } = req.params;
        const { idUsuario, idPorte, idEspecie, idRaca, nome, sexo, nascimento } = req.body;

        // Validação básica dos campos obrigatórios
        if (!sexo || !nascimento) {
            return res.status(400).json({
                message: 'Sexo e nascimento são campos obrigatórios'
            });
        }

        // Query para atualização com RETURNING para obter os dados atualizados
        const result = await client.query(`
            UPDATE Pet SET
                idUsuario = $1,
                idPorte = $2,
                idEspecie = $3,
                idRaca = $4,
                nome = $5,
                sexo = $6,
                nascimento = $7
            WHERE idPet = $8
            RETURNING *
        `, [
            idUsuario || null,
            idPorte || null,
            idEspecie || null,
            idRaca || null,
            nome || null,
            sexo,
            nascimento,
            idPet
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Pet não encontrado para atualização'
            });
        }

        res.status(200).json({
            message: 'Pet atualizado com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar o pet, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function deletePet(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idPet } = req.params;

        // Query para exclusão com RETURNING para verificar o que foi deletado
        const result = await client.query(`
            DELETE FROM Pet 
            WHERE idPet = $1
            RETURNING *
        `, [idPet]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Pet não encontrado para exclusão'
            });
        }

        res.status(200).json({
            message: 'Pet deletado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao deletar o pet, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function listarPetsPorUsuario(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idusuario } = req.params;

        console.log(`🔍 Buscando pets para o usuário ID: ${idusuario}`);

        // Buscar pets do usuário
        const result = await client.query(
            `SELECT 
                p.idPet,
                p.nome,
                p.idespecie,
                p.idraca,
                p.idusuario
             FROM Pet p 
             WHERE p.idUsuario = $1`,
            [idusuario]
        );

        console.log(`✅ Encontrados ${result.rows.length} pets para o usuário ${idusuario}`);

        res.status(200).json({
            success: true,
            message: `Pets encontrados: ${result.rows.length}`,
            pets: result.rows
        });

    } catch (error) {
        console.error('❌ Erro ao buscar pets do usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno ao buscar pets',
            error: error.message
        });
    } finally {
        if (client) {
            client.release();
        }
    }
}
/* 
async function buscarPetPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idPet } = req.params;

        const result = await client.query(
            `SELECT * FROM Pet WHERE idPet = $1`,
            [idPet]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pet não encontrado'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Pet encontrado com sucesso',
            pet: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao buscar pet:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno ao buscar pet'
        });
    } finally {
        if (client) {
            client.release();
        }
    }
}
 */
module.exports = {
    lerPet,
    lerPetPorId,
    inserirPet,
    updatePet,
    deletePet,
    listarPetsPorUsuario,
    /* buscarPetPorId */
};