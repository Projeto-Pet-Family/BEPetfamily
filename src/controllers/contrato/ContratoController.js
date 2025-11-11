const pool = require('../../connections/SQLConnections.js');

// Função auxiliar para formatar endereço completo com a nova estrutura
function formatarEndereco(contrato) {
    const enderecoParts = [];
    
    if (contrato.logradouro_nome) {
        enderecoParts.push(contrato.logradouro_nome);
    }
    if (contrato.endereco_numero) {
        enderecoParts.push(contrato.endereco_numero.toString());
    }
    if (contrato.endereco_complemento) {
        enderecoParts.push(contrato.endereco_complemento);
    }
    if (contrato.bairro_nome) {
        enderecoParts.push(contrato.bairro_nome);
    }
    if (contrato.cidade_nome) {
        enderecoParts.push(contrato.cidade_nome);
    }
    if (contrato.estado_sigla) {
        enderecoParts.push(contrato.estado_sigla);
    }
    if (contrato.cep_codigo) {
        enderecoParts.push(`CEP: ${contrato.cep_codigo}`);
    }
    
    return enderecoParts.join(', ');
}

// Função auxiliar para buscar contrato com todos os relacionamentos
async function buscarContratoComRelacionamentos(client, idContrato) {
    try {
        // Buscar contrato básico - incluindo dados do endereço da hospedagem com nova estrutura
        const contratoQuery = `
            SELECT 
                c.*, 
                h.nome as hospedagem_nome,
                h.telefone as hospedagem_telefone,
                h.email as hospedagem_email,
                e.idendereco,
                e.numero as endereco_numero,
                e.complemento as endereco_complemento,
                l.nome as logradouro_nome,
                b.nome as bairro_nome,
                ci.nome as cidade_nome,
                es.nome as estado_nome,
                es.sigla as estado_sigla,
                cep.codigo as cep_codigo,
                u.nome as usuario_nome,
                u.email as usuario_email
            FROM contrato c
            LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN endereco e ON h.idendereco = e.idendereco
            LEFT JOIN logradouro l ON e.idlogradouro = l.idlogradouro
            LEFT JOIN bairro b ON l.idbairro = b.idbairro
            LEFT JOIN cidade ci ON b.idcidade = ci.idcidade
            LEFT JOIN estado es ON ci.idestado = es.idestado
            LEFT JOIN cep ON e.idcep = cep.idcep
            LEFT JOIN usuario u ON c.idusuario = u.idusuario
            WHERE c.idcontrato = $1
        `;
        
        const contratoResult = await client.query(contratoQuery, [idContrato]);
        const contrato = contratoResult.rows[0];

        if (!contrato) {
            return null;
        }

        // Formatar endereço completo da hospedagem
        contrato.hospedagem_endereco = formatarEndereco(contrato);

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
                (cs.quantidade * cs.preco_unitario) as subtotal
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            WHERE cs.idcontrato = $1
            ORDER BY s.descricao
        `;
        
        const servicosResult = await client.query(servicosQuery, [idContrato]);
        contrato.servicos = servicosResult.rows;

        // Calcular totais
        contrato.total_servicos = contrato.servicos.reduce((total, servico) => 
            total + parseFloat(servico.subtotal || 0), 0
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

        // Calcular duração do contrato em dias
        if (contrato.datainicio && contrato.datafim) {
            const inicio = new Date(contrato.datainicio);
            const fim = new Date(contrato.datafim);
            const diffTime = Math.abs(fim - inicio);
            contrato.duracao_dias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
            contrato.duracao_dias = null;
        }

        return contrato;
    } catch (error) {
        console.error('Erro ao buscar contrato com relacionamentos:', error);
        throw error;
    }
}

// Listar todos os contratos
async function lerContratos(req, res) {
    let client;

    try {
        client = await pool.connect();
        const query = `
            SELECT 
                c.*, 
                h.nome as hospedagem_nome,
                h.telefone as hospedagem_telefone,
                h.email as hospedagem_email,
                e.numero as endereco_numero,
                e.complemento as endereco_complemento,
                l.nome as logradouro_nome,
                b.nome as bairro_nome,
                ci.nome as cidade_nome,
                es.nome as estado_nome,
                es.sigla as estado_sigla,
                cep.codigo as cep_codigo,
                u.nome as usuario_nome
            FROM contrato c
            LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN endereco e ON h.idendereco = e.idendereco
            LEFT JOIN logradouro l ON e.idlogradouro = l.idlogradouro
            LEFT JOIN bairro b ON l.idbairro = b.idbairro
            LEFT JOIN cidade ci ON b.idcidade = ci.idcidade
            LEFT JOIN estado es ON ci.idestado = es.idestado
            LEFT JOIN cep ON e.idcep = cep.idcep
            LEFT JOIN usuario u ON c.idusuario = u.idusuario
            ORDER BY c.datacriacao DESC
        `;
        const result = await client.query(query);
        
        // Formatar endereço para cada contrato
        const contratosComEndereco = result.rows.map(contrato => {
            contrato.hospedagem_endereco = formatarEndereco(contrato);
            return contrato;
        });

        // Buscar pets e serviços para cada contrato
        const contratosCompletos = await Promise.all(
            contratosComEndereco.map(async (contrato) => {
                return await buscarContratoComRelacionamentos(client, contrato.idcontrato);
            })
        );

        res.status(200).json(contratosCompletos);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar contratos',
            error: error.message
        });
        console.error('Erro ao listar contratos:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

// Buscar contrato por ID
async function buscarContratoPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        if (!contratoCompleto) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        res.status(200).json(contratoCompleto);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contrato',
            error: error.message
        });
        console.error('Erro ao buscar contrato:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

// Criar novo contrato
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
        if (client) {
            await client.query('ROLLBACK');
        }
        
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

// Atualizar contrato
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
            'SELECT * FROM contrato WHERE idcontrato = $1', 
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
                'SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1', 
                [idHospedagem]
            );
            if (hospedagemResult.rows.length === 0) {
                return res.status(400).json({ message: 'Hospedagem não encontrada' });
            }
        }

        if (idUsuario) {
            const usuarioResult = await client.query(
                'SELECT idusuario FROM usuario WHERE idusuario = $1', 
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
            updateFields.idhospedagem = `$${paramCount}`;
            values.push(idHospedagem);
            paramCount++;
        }
        if (idUsuario !== undefined) {
            updateFields.idusuario = `$${paramCount}`;
            values.push(idUsuario);
            paramCount++;
        }
        if (status !== undefined) {
            updateFields.status = `$${paramCount}`;
            values.push(status);
            paramCount++;
        }
        if (dataInicio) {
            updateFields.datainicio = `$${paramCount}`;
            values.push(dataInicio);
            paramCount++;
        }
        if (dataFim !== undefined) {
            updateFields.datafim = `$${paramCount}`;
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
            UPDATE contrato 
            SET ${setClauses} 
            WHERE idcontrato = $${paramCount} 
            RETURNING *
        `;

        const result = await client.query(query, values);

        // Buscar contrato completo atualizado
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Contrato atualizado com sucesso',
            data: contratoCompleto
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar contrato',
            error: error.message
        });
        console.error('Erro ao atualizar contrato:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

// Atualizar apenas o status do contrato
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
            'SELECT * FROM contrato WHERE idcontrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Atualizar apenas o status
        const result = await client.query(
            `UPDATE contrato 
             SET status = $1, dataatualizacao = CURRENT_TIMESTAMP
             WHERE idcontrato = $2 
             RETURNING *`,
            [status, idContrato]
        );

        // Buscar contrato completo atualizado
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Status do contrato atualizado com sucesso',
            data: contratoCompleto
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar status do contrato',
            error: error.message
        });
        console.error('Erro ao atualizar status do contrato:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

// Excluir contrato
async function excluirContrato(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT * FROM contrato WHERE idcontrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Buscar dados completos antes de excluir para retornar na resposta
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        await client.query('DELETE FROM contrato WHERE idcontrato = $1', [idContrato]);

        res.status(200).json({
            message: 'Contrato excluído com sucesso',
            data: contratoCompleto
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
            await client.release();
        }
    }
}

// Buscar contratos por usuário
async function buscarContratosPorUsuario(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario } = req.params;

        // Verificar se o usuário existe
        const usuarioResult = await client.query(
            'SELECT idusuario FROM usuario WHERE idusuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const query = `
            SELECT 
                c.idcontrato,
                c.idhospedagem,
                c.idusuario,
                c.status,
                c.datainicio,
                c.datafim,
                c.datacriacao,
                c.dataatualizacao,
                h.nome as hospedagem_nome,
                e.numero as endereco_numero,
                e.complemento as endereco_complemento,
                l.nome as logradouro_nome,
                b.nome as bairro_nome,
                ci.nome as cidade_nome,
                es.nome as estado_nome,
                es.sigla as estado_sigla,
                cep.codigo as cep_codigo
            FROM contrato c
            LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN endereco e ON h.idendereco = e.idendereco
            LEFT JOIN logradouro l ON e.idlogradouro = l.idlogradouro
            LEFT JOIN bairro b ON l.idbairro = b.idbairro
            LEFT JOIN cidade ci ON b.idcidade = ci.idcidade
            LEFT JOIN estado es ON ci.idestado = es.idestado
            LEFT JOIN cep ON e.idcep = cep.idcep
            WHERE c.idusuario = $1
            ORDER BY c.datainicio DESC, c.datacriacao DESC
        `;

        const result = await client.query(query, [idUsuario]);

        // Formatar endereço para cada contrato
        const contratosComEndereco = result.rows.map(contrato => {
            contrato.hospedagem_endereco = formatarEndereco(contrato);
            return contrato;
        });

        // Buscar pets e serviços para cada contrato
        const contratosCompletos = await Promise.all(
            contratosComEndereco.map(async (contrato) => {
                return await buscarContratoComRelacionamentos(client, contrato.idcontrato);
            })
        );

        res.status(200).json(contratosCompletos);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contratos do usuário',
            error: error.message
        });
        console.error('Erro ao buscar contratos do usuário:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

// Buscar contratos por usuário e status
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
            'SELECT idusuario FROM usuario WHERE idusuario = $1', 
            [idUsuario]
        );
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        let query = `
            SELECT 
                c.idcontrato,
                c.idhospedagem,
                c.idusuario,
                c.status,
                c.datainicio,
                c.datafim,
                c.datacriacao,
                c.dataatualizacao,
                h.nome as hospedagem_nome,
                e.numero as endereco_numero,
                e.complemento as endereco_complemento,
                l.nome as logradouro_nome,
                b.nome as bairro_nome,
                ci.nome as cidade_nome,
                es.nome as estado_nome,
                es.sigla as estado_sigla,
                cep.codigo as cep_codigo
            FROM contrato c
            LEFT JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN endereco e ON h.idendereco = e.idendereco
            LEFT JOIN logradouro l ON e.idlogradouro = l.idlogradouro
            LEFT JOIN bairro b ON l.idbairro = b.idbairro
            LEFT JOIN cidade ci ON b.idcidade = ci.idcidade
            LEFT JOIN estado es ON ci.idestado = es.idestado
            LEFT JOIN cep ON e.idcep = cep.idcep
            WHERE c.idusuario = $1
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

        query += ` ORDER BY c.datainicio DESC, c.datacriacao DESC`;

        const result = await client.query(query, values);

        // Formatar endereço para cada contrato
        const contratosComEndereco = result.rows.map(contrato => {
            contrato.hospedagem_endereco = formatarEndereco(contrato);
            return contrato;
        });

        // Buscar pets e serviços para cada contrato
        const contratosCompletos = await Promise.all(
            contratosComEndereco.map(async (contrato) => {
                return await buscarContratoComRelacionamentos(client, contrato.idcontrato);
            })
        );

        res.status(200).json(contratosCompletos);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar contratos do usuário',
            error: error.message
        });
        console.error('Erro ao buscar contratos do usuário:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
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