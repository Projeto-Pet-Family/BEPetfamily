const pool = require('../../connections/SQLConnections.js');

async function lerContratos(req, res) {
    let client;

    try {
        client = await pool.connect();
        const query = `
            SELECT 
                c.*, 
                h.nome as hospedagem_nome, 
                u.nome as usuario_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Usuario u ON c.idUsuario = u.idUsuario
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
            SELECT 
                c.*, 
                h.nome as hospedagem_nome, 
                u.nome as usuario_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            LEFT JOIN Usuario u ON c.idUsuario = u.idUsuario
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
        if (client) {
            await client.end();
        }
    }
}

// controllers/contrato/ContratoController.js
async function criarContrato(req, res) {
    let client;

    try {
        client = await pool.connect();

        const {
            idHospedagem,
            idUsuario,
            status = 'em_aprovacao',
            dataInicio,
            dataFim,
            pets = [], // Array de IDs dos pets
            servicos = [] // Array de objetos { idservico, quantidade? }
        } = req.body;

        console.log('📦 Dados recebidos para criar contrato:', {
            idHospedagem,
            idUsuario,
            status,
            dataInicio,
            dataFim,
            pets,
            servicos
        });

        // Validações básicas
        if (!idHospedagem || !idUsuario || !dataInicio) {
            return res.status(400).json({
                message: 'idHospedagem, idUsuario e dataInicio são obrigatórios'
            });
        }

        // Validar status
        const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
        if (!statusValidos.includes(status)) {
            return res.status(400).json({
                message: 'Status inválido. Valores permitidos: ' + statusValidos.join(', ')
            });
        }

        // Validar datas
        const inicio = new Date(dataInicio);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        if (inicio < hoje) {
            return res.status(400).json({
                message: 'Data início não pode ser anterior à data atual'
            });
        }

        if (dataFim) {
            const fim = new Date(dataFim);
            if (fim < inicio) {
                return res.status(400).json({
                    message: 'Data fim não pode ser anterior à data início'
                });
            }
        }

        // Verificar existência das entidades relacionadas
        const hospedagemResult = await client.query(
            'SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1', 
            [idHospedagem]
        );
        if (hospedagemResult.rows.length === 0) {
            return res.status(400).json({ message: 'Hospedagem não encontrada' });
        }

        const usuarioResult = await client.query(
            'SELECT idusuario FROM usuario WHERE idusuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(400).json({ message: 'Usuário não encontrado' });
        }

        // Verificar se os pets pertencem ao usuário
        if (pets.length > 0) {
            const petsResult = await client.query(
                'SELECT idpet FROM pet WHERE idpet = ANY($1) AND idusuario = $2',
                [pets, idUsuario]
            );
            if (petsResult.rows.length !== pets.length) {
                return res.status(400).json({ message: 'Um ou mais pets não pertencem ao usuário' });
            }
        }

        // Verificar se os serviços pertencem à hospedagem
        if (servicos.length > 0) {
            const servicosIds = servicos.map(s => s.idservico);
            const servicosResult = await client.query(
                'SELECT idservico FROM servico WHERE idservico = ANY($1) AND idhospedagem = $2 AND ativo = true',
                [servicosIds, idHospedagem]
            );
            if (servicosResult.rows.length !== servicosIds.length) {
                return res.status(400).json({ message: 'Um ou mais serviços não estão disponíveis para esta hospedagem' });
            }
        }

        // Verificar se já existe contrato conflitante para as datas
        const conflitoQuery = `
            SELECT idcontrato 
            FROM contrato 
            WHERE idusuario = $1 
            AND status IN ('em_aprovacao', 'aprovado', 'em_execucao')
            AND (
                (datainicio <= $2 AND datafim >= $3) OR
                (datainicio <= $2 AND $3 IS NULL) OR
                ($2 BETWEEN datainicio AND COALESCE(datafim, $2))
            )
        `;
        
        const conflitoResult = await client.query(conflitoQuery, [
            idUsuario, 
            dataInicio, 
            dataFim || dataInicio
        ]);

        if (conflitoResult.rows.length > 0) {
            return res.status(400).json({
                message: 'Já existe um contrato ativo para este período'
            });
        }

        // Iniciar transação
        await client.query('BEGIN');

        // 1. Inserir contrato
        const contratoResult = await client.query(
            `INSERT INTO contrato (idhospedagem, idusuario, status, datainicio, datafim) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [idHospedagem, idUsuario, status, dataInicio, dataFim]
        );

        const contrato = contratoResult.rows[0];
        const idContrato = contrato.idcontrato;

        console.log('✅ Contrato criado com ID:', idContrato);

        // 2. Inserir pets do contrato
        if (pets.length > 0) {
            console.log('🐾 Adicionando pets ao contrato:', pets);
            
            for (const idPet of pets) {
                await client.query(
                    `INSERT INTO contrato_pet (idcontrato, idpet) 
                     VALUES ($1, $2)`,
                    [idContrato, idPet]
                );
            }
            console.log('✅ Pets adicionados com sucesso');
        }

        // 3. Inserir serviços do contrato
        if (servicos.length > 0) {
            console.log('🛎️ Adicionando serviços ao contrato:', servicos);
            
            for (const servico of servicos) {
                const idServico = servico.idservico;
                const quantidade = servico.quantidade || 1;
                
                // Buscar preço atual do serviço
                const precoResult = await client.query(
                    'SELECT preco FROM servico WHERE idservico = $1',
                    [idServico]
                );
                
                const precoUnitario = precoResult.rows[0].preco;

                await client.query(
                    `INSERT INTO contratoservico (idcontrato, idservico, quantidade, preco_unitario) 
                     VALUES ($1, $2, $3, $4)`,
                    [idContrato, idServico, quantidade, precoUnitario]
                );
            }
            console.log('✅ Serviços adicionados com sucesso');
        }

        // Commit da transação
        await client.query('COMMIT');

        // Buscar contrato completo com relacionamentos
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        console.log('🎉 Contrato criado com sucesso:', contratoCompleto);

        res.status(201).json({
            message: 'Contrato criado com sucesso',
            data: contratoCompleto
        });

    } catch (error) {
        // Rollback em caso de erro
        await client.query('ROLLBACK');
        
        console.error('❌ Erro ao criar contrato:', error);
        res.status(500).json({
            message: 'Erro ao criar contrato',
            error: error.message
        });
    } finally {
        if (client) {
            await client.release();
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
            status,
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

        // Validar status se fornecido
        if (status) {
            const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
            if (!statusValidos.includes(status)) {
                return res.status(400).json({
                    message: 'Status inválido. Valores permitidos: ' + statusValidos.join(', ')
                });
            }
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
        if (status !== undefined) {
            updateFields.status = `$${paramCount}`;
            values.push(status);
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

async function atualizarStatusContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { status } = req.body;

        // Validar status
        const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
        if (!statusValidos.includes(status)) {
            return res.status(400).json({
                message: 'Status inválido. Valores permitidos: ' + statusValidos.join(', ')
            });
        }

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT * FROM Contrato WHERE idContrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Atualizar apenas o status
        const result = await client.query(
            `UPDATE Contrato 
             SET status = $1, dataAtualizacao = CURRENT_TIMESTAMP
             WHERE idContrato = $2 
             RETURNING *`,
            [status, idContrato]
        );

        res.status(200).json({
            message: 'Status do contrato atualizado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar status do contrato',
            error: error.message
        });
        console.error('Erro ao atualizar status do contrato:', error);
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
                c.idHospedagem,
                c.idUsuario,
                c.status,
                c.dataInicio,
                c.dataFim,
                c.dataCriacao,
                c.dataAtualizacao,
                h.nome as hospedagem_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            WHERE c.idUsuario = $1
            ORDER BY c.dataInicio DESC, c.dataCriacao DESC
        `;

        const result = await client.query(query, [idUsuario]);

        // Formatar o status para português
        const contratosFormatados = result.rows.map(contrato => {
            const statusMap = {
                'em_aprovacao': 'Em aprovação',
                'aprovado': 'Aprovado',
                'em_execucao': 'Em execução',
                'concluido': 'Concluído',
                'negado': 'Negado',
                'cancelado': 'Cancelado'
            };

            return {
                ...contrato,
                status_descricao: statusMap[contrato.status] || 'Desconhecido'
            };
        });

        res.status(200).json(contratosFormatados);

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

async function buscarContratosPorUsuarioEStatus(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario, status } = req.query;

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
                c.idHospedagem,
                c.idUsuario,
                c.status,
                c.dataInicio,
                c.dataFim,
                c.dataCriacao,
                c.dataAtualizacao,
                h.nome as hospedagem_nome
            FROM Contrato c
            LEFT JOIN Hospedagem h ON c.idHospedagem = h.idHospedagem
            WHERE c.idUsuario = $1
        `;

        const values = [idUsuario];
        let paramCount = 2;

        if (status) {
            // Validar status
            const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
            if (!statusValidos.includes(status)) {
                return res.status(400).json({
                    message: 'Status inválido. Valores permitidos: ' + statusValidos.join(', ')
                });
            }
            
            query += ` AND c.status = $${paramCount}`;
            values.push(status);
            paramCount++;
        }

        query += ` ORDER BY c.dataInicio DESC, c.dataCriacao DESC`;

        const result = await client.query(query, values);

        // Formatar o status para português
        const contratosFormatados = result.rows.map(contrato => {
            const statusMap = {
                'em_aprovacao': 'Em aprovação',
                'aprovado': 'Aprovado',
                'em_execucao': 'Em execução',
                'concluido': 'Concluído',
                'negado': 'Negado',
                'cancelado': 'Cancelado'
            };

            return {
                ...contrato,
                status_descricao: statusMap[contrato.status] || 'Desconhecido'
            };
        });

        res.status(200).json(contratosFormatados);

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

// Adicione esta função ao ContratoController.js
async function buscarContratoComRelacionamentos(client, idContrato) {
    // Buscar contrato básico
    const contratoQuery = `
        SELECT 
            c.*, 
            h.nome as hospedagem_nome, 
            u.nome as usuario_nome
        FROM contrato c
        LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
        LEFT JOIN usuario u ON c.idusuario = u.idusuario
        WHERE c.idcontrato = $1
    `;
    
    const contratoResult = await client.query(contratoQuery, [idContrato]);
    const contrato = contratoResult.rows[0];

    if (!contrato) {
        return null;
    }

    // Buscar pets do contrato
    const petsQuery = `
        SELECT 
            cp.idcontrato_pet,
            p.idpet,
            p.nome,
            p.sexo,
            p.nascimento
        FROM contrato_pet cp
        JOIN pet p ON cp.idpet = p.idpet
        WHERE cp.idcontrato = $1
    `;
    
    const petsResult = await client.query(petsQuery, [idContrato]);
    contrato.pets = petsResult.rows;

    // Buscar serviços do contrato
    const servicosQuery = `
        SELECT 
            cs.idcontratoservico,
            cs.idservico,
            cs.quantidade,
            cs.preco_unitario,
            s.descricao,
            s.preco as preco_atual,
            s.duracao,
            (cs.quantidade * cs.preco_unitario) as subtotal
        FROM contratoservico cs
        JOIN servico s ON cs.idservico = s.idservico
        WHERE cs.idcontrato = $1
    `;
    
    const servicosResult = await client.query(servicosQuery, [idContrato]);
    contrato.servicos = servicosResult.rows;

    // Calcular totais
    contrato.total_servicos = contrato.servicos.reduce((total, servico) => 
        total + parseFloat(servico.subtotal), 0
    );

    // Formatar status para português
    const statusMap = {
        'em_aprovacao': 'Em aprovação',
        'aprovado': 'Aprovado',
        'em_execucao': 'Em execução',
        'concluido': 'Concluído',
        'negado': 'Negado',
        'cancelado': 'Cancelado'
    };
    contrato.status_descricao = statusMap[contrato.status] || 'Desconhecido';

    return contrato;
}

module.exports = {
    lerContratos,
    buscarContratoPorId,
    criarContrato,
    atualizarContrato,
    atualizarStatusContrato,
    excluirContrato,
    buscarContratosPorUsuario,
    buscarContratosPorUsuarioEStatus,
    buscarContratoComRelacionamentos
};