const pool = require('../../connections/SQLConnections.js');

async function lerContratos(req, res) {
    let client;

    try {
        client = await pool.connect();
        const query = `
            SELECT c.*, h.nome as hospedagem_nome, u.nome as usuario_nome, s.descricao as status_descricao
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Usuario u ON c.idUsuario = u.idUsuario
            LEFT JOIN Status s ON c.idStatus = s.idStatus
        `;
        const result = await client.query(query);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar contratos',
            error: error.message
        });
        console.error('Erro ao listar contratos:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarContratoPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const query = `
            SELECT c.*, h.nome as hospedagem_nome, u.nome as usuario_nome, s.descricao as status_descricao
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Usuario u ON c.idUsuario = u.idUsuario
            LEFT JOIN Status s ON c.idStatus = s.idStatus
            WHERE c.idContrato = $1
        `;

        const result = await client.query(query, [idContrato]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contrato',
            error: error.message
        });
        console.error('Erro ao buscar contrato:', error);
    } finally {
        {
            await client.end();
        }
    }
}

async function criarContrato(req, res) {
    let client;

    try {
        client = await pool.connect();

        const {
            idHospedagem,
            idUsuario,
            idStatus,
            dataInicio,
            dataFim
        } = req.body;

        // Validações básicas
        if (!idHospedagem || !idUsuario || !idStatus || !dataInicio) {
            return res.status(400).json({
                message: 'idHospedagem, idUsuario, idStatus e dataInicio são obrigatórios'
            });
        }

        // Validar datas
        const inicio = new Date(dataInicio);
        const fim = dataFim ? new Date(dataFim) : null;

        if (fim && fim < inicio) {
            return res.status(400).json({
                message: 'Data fim não pode ser anterior à data início'
            });
        }

        // Verificar existência das entidades relacionadas
        const hospedagemResult = await client.query(
            'SELECT idHospedagem FROM Hospedagem WHERE idHospedagem = $1', 
            [idHospedagem]
        );
        if (hospedagemResult.rows.length === 0) {
            return res.status(400).json({ message: 'Hospedagem não encontrada' });
        }

        const usuarioResult = await client.query(
            'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(400).json({ message: 'Usuário não encontrado' });
        }

        const statusResult = await client.query(
            'SELECT idStatus FROM Status WHERE idStatus = $1', 
            [idStatus]
        );
        if (statusResult.rows.length === 0) {
            return res.status(400).json({ message: 'Status não encontrado' });
        }

        // Inserir contrato e retornar os dados
        const result = await client.query(
            `INSERT INTO Contrato (idHospedagem, idUsuario, idStatus, dataInicio, dataFim) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [idHospedagem, idUsuario, idStatus, dataInicio, dataFim]
        );

        res.status(201).json({
            message: 'Contrato criado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar contrato',
            error: error.message
        });
        console.error('Erro ao criar contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function atualizarContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const {
            idHospedagem,
            idUsuario,
            idStatus,
            dataInicio,
            dataFim
        } = req.body;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT * FROM Contrato WHERE idContrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Validar datas se fornecidas
        if (dataInicio && dataFim) {
            const inicio = new Date(dataInicio);
            const fim = new Date(dataFim);

            if (fim < inicio) {
                return res.status(400).json({
                    message: 'Data fim não pode ser anterior à data início'
                });
            }
        }

        // Verificar entidades relacionadas se fornecidas
        if (idHospedagem) {
            const hospedagemResult = await client.query(
                'SELECT idHospedagem FROM Hospedagem WHERE idHospedagem = $1', 
                [idHospedagem]
            );
            if (hospedagemResult.rows.length === 0) {
                return res.status(400).json({ message: 'Hospedagem não encontrada' });
            }
        }

        if (idUsuario) {
            const usuarioResult = await client.query(
                'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
                [idUsuario]
            );
            if (usuarioResult.rows.length === 0) {
                return res.status(400).json({ message: 'Usuário não encontrado' });
            }
        }

        if (idStatus) {
            const statusResult = await client.query(
                'SELECT idStatus FROM Status WHERE idStatus = $1', 
                [idStatus]
            );
            if (statusResult.rows.length === 0) {
                return res.status(400).json({ message: 'Status não encontrado' });
            }
        }

        // Construir query dinâmica
        const updateFields = {};
        const values = [];
        let paramCount = 1;

        if (idHospedagem !== undefined) {
            updateFields.idHospedagem = `$${paramCount}`;
            values.push(idHospedagem);
            paramCount++;
        }
        if (idUsuario !== undefined) {
            updateFields.idUsuario = `$${paramCount}`;
            values.push(idUsuario);
            paramCount++;
        }
        if (idStatus !== undefined) {
            updateFields.idStatus = `$${paramCount}`;
            values.push(idStatus);
            paramCount++;
        }
        if (dataInicio) {
            updateFields.dataInicio = `$${paramCount}`;
            values.push(dataInicio);
            paramCount++;
        }
        if (dataFim !== undefined) {
            updateFields.dataFim = `$${paramCount}`;
            values.push(dataFim);
            paramCount++;
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        const setClauses = Object.entries(updateFields)
            .map(([key, value]) => `${key} = ${value}`)
            .join(', ');

        values.push(idContrato);

        const query = `
            UPDATE Contrato 
            SET ${setClauses} 
            WHERE idContrato = $${paramCount} 
            RETURNING *
        `;

        const result = await client.query(query, values);

        res.status(200).json({
            message: 'Contrato atualizado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar contrato',
            error: error.message
        });
        console.error('Erro ao atualizar contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function excluirContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT * FROM Contrato WHERE idContrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        await client.query('DELETE FROM Contrato WHERE idContrato = $1', [idContrato]);

        res.status(200).json({
            message: 'Contrato excluído com sucesso',
            data: contratoResult.rows[0]
        });

    } catch (error) {
        // PostgreSQL error code for foreign key violation
        if (error.code === '23503') {
            return res.status(400).json({
                message: 'Não é possível excluir o contrato pois está sendo utilizado em outros registros'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir contrato',
            error: error.message
        });
        console.error('Erro ao excluir contrato:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarContratosPorUsuario(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario } = req.params;

        // Verificar se o usuário existe
        const usuarioResult = await client.query(
            'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const query = `
            SELECT 
                c.idContrato,
                c.dataInicio,
                c.dataFim,
                h.nome as hospedagem_nome,
                h.idHospedagem,
                s.descricao as status_descricao,
                s.idStatus,
                cp.idPet,
                p.nome as pet_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Status s ON c.idStatus = s.idStatus
            LEFT JOIN Contrato_Pet cp ON c.idContrato = cp.idContrato
            LEFT JOIN Pet p ON cp.idPet = p.idPet
            WHERE c.idUsuario = $1
            ORDER BY c.dataInicio DESC
        `;

        const result = await client.query(query, [idUsuario]);

        // Agrupar os resultados por contrato (um contrato pode ter múltiplos pets)
        const contratosAgrupados = {};
        
        result.rows.forEach(row => {
            const contratoId = row.idcontrato;
            
            if (!contratosAgrupados[contratoId]) {
                contratosAgrupados[contratoId] = {
                    idContrato: row.idcontrato,
                    dataInicio: row.datainicio,
                    dataFim: row.datafim,
                    hospedagem_nome: row.hospedagem_nome,
                    idHospedagem: row.idhospedagem,
                    status_descricao: row.status_descricao,
                    idStatus: row.idstatus,
                    pets: []
                };
            }
            
            // Adicionar pet se existir
            if (row.idpet) {
                contratosAgrupados[contratoId].pets.push({
                    idPet: row.idpet,
                    pet_nome: row.pet_nome
                });
            }
        });

        // Converter objeto para array
        const contratos = Object.values(contratosAgrupados);

        res.status(200).json(contratos);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contratos do usuário',
            error: error.message
        });
        console.error('Erro ao buscar contratos do usuário:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Método alternativo se você quiser uma versão mais simples sem agrupamento
async function buscarContratosPorUsuarioSimples(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario } = req.params;

        // Verificar se o usuário existe
        const usuarioResult = await client.query(
            'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const query = `
            SELECT 
                c.idContrato,
                c.dataInicio,
                c.dataFim,
                h.nome as hospedagem_nome,
                h.idHospedagem,
                s.descricao as status_descricao,
                s.idStatus,
                ARRAY_AGG(DISTINCT p.idPet) as idPets,
                ARRAY_AGG(DISTINCT p.nome) as pet_nomes
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Status s ON c.idStatus = s.idStatus
            LEFT JOIN Contrato_Pet cp ON c.idContrato = cp.idContrato
            LEFT JOIN Pet p ON cp.idPet = p.idPet
            WHERE c.idUsuario = $1
            GROUP BY c.idContrato, h.nome, h.idHospedagem, s.descricao, s.idStatus
            ORDER BY c.dataInicio DESC
        `;

        const result = await client.query(query, [idUsuario]);

        res.status(200).json(result.rows);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contratos do usuário',
            error: error.message
        });
        console.error('Erro ao buscar contratos do usuário:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Método para buscar contratos por usuário e status
async function buscarContratosPorUsuarioEStatus(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario, idStatus } = req.query;

        if (!idUsuario) {
            return res.status(400).json({ message: 'idUsuario é obrigatório' });
        }

        // Verificar se o usuário existe
        const usuarioResult = await client.query(
            'SELECT idUsuario FROM Usuario WHERE idUsuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        let query = `
            SELECT 
                c.idContrato,
                c.dataInicio,
                c.dataFim,
                h.nome as hospedagem_nome,
                h.idHospedagem,
                s.descricao as status_descricao,
                s.idStatus,
                ARRAY_AGG(DISTINCT p.idPet) as idPets,
                ARRAY_AGG(DISTINCT p.nome) as pet_nomes
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Status s ON c.idStatus = s.idStatus
            LEFT JOIN Contrato_Pet cp ON c.idContrato = cp.idContrato
            LEFT JOIN Pet p ON cp.idPet = p.idPet
            WHERE c.idUsuario = $1
        `;

        const values = [idUsuario];
        let paramCount = 2;

        if (idStatus) {
            query += ` AND c.idStatus = $${paramCount}`;
            values.push(idStatus);
            paramCount++;
        }

        query += `
            GROUP BY c.idContrato, h.nome, h.idHospedagem, s.descricao, s.idStatus
            ORDER BY c.dataInicio DESC
        `;

        const result = await client.query(query, values);

        res.status(200).json(result.rows);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contratos do usuário',
            error: error.message
        });
        console.error('Erro ao buscar contratos do usuário:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    lerContratos,
    buscarContratoPorId,
    criarContrato,
    atualizarContrato,
    excluirContrato,
    buscarContratosPorUsuario
};