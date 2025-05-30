const sqlconnection = require('../connections/SQLConnections.js');

async function lerPets(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const [result] = await sql.query('SELECT * FROM Pet');
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar pets',
            error: error.message
        });
        console.error('Erro ao listar pets:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarPetPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idPet } = req.params;
        const [result] = await sql.query('SELECT * FROM Pet WHERE idPet = ?', [idPet]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Pet não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar pet',
            error: error.message
        });
        console.error('Erro ao buscar pet:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarPetsPorUsuario(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idUsuario } = req.params;
        const [result] = await sql.query('SELECT * FROM Pet WHERE idUsuario = ?', [idUsuario]);

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar pets do usuário',
            error: error.message
        });
        console.error('Erro ao buscar pets do usuário:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarPet(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            idUsuario,
            porte,
            especie,
            raca,
            nome,
            sexo,
            nascimento
        } = req.body;

        // Validar campos obrigatórios
        if (!porte || !especie || !raca || !sexo || !nascimento) {
            return res.status(400).json({
                message: 'Porte, espécie, raça, sexo e nascimento são campos obrigatórios'
            });
        }

        // Verificar se usuário existe
        const [usuario] = await sql.query('SELECT idUsuario FROM Usuario WHERE idUsuario = ?', [idUsuario]);
        if (usuario.length === 0) {
            return res.status(400).json({
                message: 'Usuário não encontrado'
            });
        }

        // Gerar ID único para o pet
        const [idResult] = await sql.query('SELECT MAX(idPet) as maxId FROM Pet');
        const novoId = (idResult[0].maxId || 0) + 1;

        await sql.query(
            'INSERT INTO Pet (idPet, idUsuario, porte, especie, raca, nome, sexo, nascimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [novoId, idUsuario, porte, especie, raca, nome, sexo, nascimento]
        );

        const novoPet = {
            idPet: novoId,
            idUsuario,
            porte,
            especie,
            raca,
            nome,
            sexo,
            nascimento
        };

        res.status(201).json({
            message: 'Pet criado com sucesso',
            data: novoPet
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar pet',
            error: error.message
        });
        console.error('Erro ao criar pet:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarPet(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idPet } = req.params;

        const {
            idUsuario,
            porte,
            especie,
            raca,
            nome,
            sexo,
            nascimento
        } = req.body;

        // Verificar se o pet existe
        const [pet] = await sql.query('SELECT * FROM Pet WHERE idPet = ?', [idPet]);
        if (pet.length === 0) {
            return res.status(404).json({ message: 'Pet não encontrado' });
        }

        // Verificar se usuário existe (se for fornecido)
        if (idUsuario) {
            const [usuario] = await sql.query('SELECT idUsuario FROM Usuario WHERE idUsuario = ?', [idUsuario]);
            if (usuario.length === 0) {
                return res.status(400).json({
                    message: 'Usuário não encontrado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (idUsuario !== undefined) updateFields.idUsuario = idUsuario;
        if (porte) updateFields.porte = porte;
        if (especie) updateFields.especie = especie;
        if (raca) updateFields.raca = raca;
        if (nome !== undefined) updateFields.nome = nome;
        if (sexo) updateFields.sexo = sexo;
        if (nascimento) updateFields.nascimento = nascimento;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Pet SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idPet = ?';
        values.push(idPet);

        await sql.query(query, values);

        // Buscar o pet atualizado
        const [updatedPet] = await sql.query('SELECT * FROM Pet WHERE idPet = ?', [idPet]);

        res.status(200).json({
            message: 'Pet atualizado com sucesso',
            data: updatedPet[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar pet',
            error: error.message
        });
        console.error('Erro ao atualizar pet:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirPet(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idPet } = req.params;

        // Verificar se o pet existe
        const [pet] = await sql.query('SELECT * FROM Pet WHERE idPet = ?', [idPet]);
        if (pet.length === 0) {
            return res.status(404).json({ message: 'Pet não encontrado' });
        }

        await sql.query('DELETE FROM Pet WHERE idPet = ?', [idPet]);

        res.status(200).json({
            message: 'Pet excluído com sucesso',
            data: pet[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir pet',
            error: error.message
        });
        console.error('Erro ao excluir pet:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerPets,
    buscarPetPorId,
    buscarPetsPorUsuario,
    criarPet,
    atualizarPet,
    excluirPet
};