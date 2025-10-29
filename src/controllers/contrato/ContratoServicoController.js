const pool = require('../../connections/SQLConnections.js');

async function lerContratosServico(req, res) {
    let client;
    try {
        client = await pool();
        const result = await client.query('SELECT * FROM "ContratoServico"');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Erro ao ler contratos serviços:', error);
        res.status(500).json({
            message: 'Erro ao buscar contratos serviços',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

async function buscarContratoServicoPorId(req, res) {
    let client;
    try {
        client = await pool();
        const { idContratoServico } = req.params;
        const result = await client.query(
            'SELECT * FROM "ContratoServico" WHERE "idContratoServico" = $1', 
            [idContratoServico]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao buscar contrato serviço:', error);
        res.status(500).json({
            message: 'Erro ao buscar contrato serviço',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

async function inserirContratoServico(req, res) {
    let client;
    try {
        client = await pool();
        const { idContrato, idServico } = req.body;

        // Validação dos dados
        if (!idContrato || !idServico) {
            return res.status(400).json({ message: 'idContrato e idServico são obrigatórios' });
        }

        // Verifica se os IDs existem nas tabelas relacionadas
        const contratoExists = await client.query(
            'SELECT 1 FROM "Contrato" WHERE "idContrato" = $1', 
            [idContrato]
        );
        const servicoExists = await client.query(
            'SELECT 1 FROM "Servico" WHERE "idServico" = $1', 
            [idServico]
        );

        if (contratoExists.rows.length === 0 || servicoExists.rows.length === 0) {
            return res.status(400).json({ message: 'Contrato ou Serviço não encontrado' });
        }

        const result = await client.query(
            'INSERT INTO "ContratoServico" ("idContrato", "idServico") VALUES ($1, $2) RETURNING "idContratoServico"',
            [idContrato, idServico]
        );

        res.status(201).json({
            message: 'Contrato serviço criado com sucesso!',
            idContratoServico: result.rows[0].idContratoServico,
            idContrato,
            idServico
        });
    } catch (error) {
        console.error('Erro ao inserir contrato serviço:', error);
        res.status(500).json({
            message: 'Erro ao criar contrato serviço',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

async function atualizarContratoServico(req, res) {
    let client;
    try {
        client = await pool();
        const { idContratoServico } = req.params;
        const { idContrato, idServico } = req.body;

        // Validação dos dados
        if (!idContrato || !idServico) {
            return res.status(400).json({ message: 'idContrato e idServico são obrigatórios' });
        }

        // Verifica se o registro existe
        const existing = await client.query(
            'SELECT 1 FROM "ContratoServico" WHERE "idContratoServico" = $1', 
            [idContratoServico]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }

        // Verifica se os novos IDs existem
        const contratoExists = await client.query(
            'SELECT 1 FROM "Contrato" WHERE "idContrato" = $1', 
            [idContrato]
        );
        const servicoExists = await client.query(
            'SELECT 1 FROM "Servico" WHERE "idServico" = $1', 
            [idServico]
        );

        if (contratoExists.rows.length === 0 || servicoExists.rows.length === 0) {
            return res.status(400).json({ message: 'Contrato ou Serviço não encontrado' });
        }

        await client.query(
            'UPDATE "ContratoServico" SET "idContrato" = $1, "idServico" = $2 WHERE "idContratoServico" = $3',
            [idContrato, idServico, idContratoServico]
        );

        res.status(200).json({
            message: 'Contrato serviço atualizado com sucesso!',
            idContratoServico,
            idContrato,
            idServico
        });
    } catch (error) {
        console.error('Erro ao atualizar contrato serviço:', error);
        res.status(500).json({
            message: 'Erro ao atualizar contrato serviço',
            error: error.message
        });
    } finally {
        if (client) await client.end();
    }
}

async function excluirContratoServico(req, res) {
    let client;
    try {
        client = await pool();
        const { idContratoServico } = req.params;

        // Verifica se o registro existe
        const existing = await client.query(
            'SELECT 1 FROM "ContratoServico" WHERE "idContratoServico" = $1', 
            [idContratoServico]
        );
        if (existing.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato serviço não encontrado' });
        }

        await client.query(
            'DELETE FROM "ContratoServico" WHERE "idContratoServico" = $1', 
            [idContratoServico]
        );

        res.status(200).json({
            message: 'Contrato serviço excluído com sucesso!',
            idContratoServico
        });
    } catch (error) {
        console.error('Erro ao excluir contrato serviço:', error);
        res.status(500).json({
            message: 'Erro ao excluir contrato serviço',
            error: error.message
        });
    } finally {
        if (client) await client.end();
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
    lerContratosServico,
    buscarContratoServicoPorId,
    inserirContratoServico,
    atualizarContratoServico,
    excluirContratoServico,
    buscarContratosPorUsuario,
    buscarContratosPorUsuarioSimples,
    buscarContratosPorUsuarioEStatus
};