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
        if (!idusuario || !nome || !sexo || !idusuario || !idporte || !idespecie || !idraca) {
            return res.status(400).json({
                message: 'idusuario, nome, sexo, idusuario, idporte, idespecie e idraca são campos obrigatórios'
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
        const { idUsuario, idPorte, idEspecie, idRaca, nome, sexo } = req.body;

        // Validação básica dos campos obrigatórios
        if (!nome || !sexo) {
            return res.status(400).json({
                message: 'Nome e sexo são campos obrigatórios'
            });
        }

        // Primeiro, buscar os dados atuais do pet
        const petAtual = await client.query(
            'SELECT * FROM Pet WHERE idPet = $1',
            [idPet]
        );

        if (petAtual.rows.length === 0) {
            return res.status(404).json({
                message: 'Pet não encontrado'
            });
        }

        const dadosAtuais = petAtual.rows[0];

        // Usar COALESCE para manter os valores atuais se não forem fornecidos novos
        const result = await client.query(`
            UPDATE Pet SET
                idUsuario = COALESCE($1, idUsuario),
                idPorte = COALESCE($2, idPorte),
                idEspecie = COALESCE($3, idEspecie),
                idRaca = COALESCE($4, idRaca),
                nome = COALESCE($5, nome),
                sexo = COALESCE($6, sexo)
            WHERE idPet = $7
            RETURNING *
        `, [
            idUsuario !== undefined ? idUsuario : dadosAtuais.idusuario,
            idPorte !== undefined ? idPorte : dadosAtuais.idporte,
            idEspecie !== undefined ? idEspecie : dadosAtuais.idespecie,
            idRaca !== undefined ? idRaca : dadosAtuais.idraca,
            nome !== undefined ? nome : dadosAtuais.nome,
            sexo !== undefined ? sexo : dadosAtuais.sexo,
            idPet
        ]);

        console.log('✅ Pet atualizado:', result.rows[0]);

        res.status(200).json({
            message: 'Pet atualizado com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Erro detalhado no updatePet:', error);
        res.status(500).json({
            message: 'Erro ao atualizar o pet, confira o console'
        });
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

async function inserirPetParaNovoUsuario(req, res) {
    let client;

    try {
        client = await pool.connect();

        const { 
            idUsuario,
            nome = 'Meu Pet',
            idPorte = null,
            idEspecie = null,
            idRaca = null,
            sexo = 'M'
        } = req.body;

        // Validação básica
        if (!idUsuario) {
            return res.status(400).json({ message: 'ID do usuário é obrigatório' });
        }

        // Verificar se o usuário existe
        const userResult = await client.query('SELECT * FROM Usuario WHERE idUsuario = $1', [idUsuario]);
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        // Inserir o pet
        const result = await client.query(
            `INSERT INTO Pet 
             (idUsuario, idPorte, idEspecie, idRaca, nome, sexo) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING idPet, nome, sexo, idUsuario`,
            [idUsuario, idPorte, idEspecie, idRaca, nome, sexo]
        );

        res.status(201).json({
            message: 'Pet criado com sucesso para o novo usuário!',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar pet para o usuário, confira o console'
        });
        console.log(error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function inserirPetPadraoAoRegistrar(idUsuario, client) {
    try {
        // Buscar valores padrão das tabelas relacionadas
        const especieResult = await client.query('SELECT idEspecie FROM Especie LIMIT 1');
        const porteResult = await client.query('SELECT idPorte FROM Porte LIMIT 1');
        const racaResult = await client.query('SELECT idRaca FROM Raca LIMIT 1');

        const idEspecie = especieResult.rows.length > 0 ? especieResult.rows[0].idespecie : null;
        const idPorte = porteResult.rows.length > 0 ? porteResult.rows[0].idporte : null;
        const idRaca = racaResult.rows.length > 0 ? racaResult.rows[0].idraca : null;

        // Inserir pet padrão
        const result = await client.query(
            `INSERT INTO Pet 
             (idUsuario, idPorte, idEspecie, idRaca, nome, sexo) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING idPet, nome, sexo, idUsuario`,
            [idUsuario, idPorte, idEspecie, idRaca, 'Meu Pet', 'M']
        );

        console.log(`Pet padrão criado para usuário ${idUsuario}:`, result.rows[0]);
        return result.rows[0];

    } catch (error) {
        console.error('Erro ao criar pet padrão:', error);
        throw error;
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