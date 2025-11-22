const pool = require('../../connections/SQLConnections.js');

// Funções auxiliares
function formatarEndereco(contrato) {
    const enderecoParts = [];
    
    if (contrato.logradouro_nome) enderecoParts.push(contrato.logradouro_nome);
    if (contrato.endereco_numero) enderecoParts.push(contrato.endereco_numero.toString());
    if (contrato.endereco_complemento) enderecoParts.push(contrato.endereco_complemento);
    if (contrato.bairro_nome) enderecoParts.push(contrato.bairro_nome);
    if (contrato.cidade_nome) enderecoParts.push(contrato.cidade_nome);
    if (contrato.estado_sigla) enderecoParts.push(contrato.estado_sigla);
    if (contrato.cep_codigo) enderecoParts.push(`CEP: ${contrato.cep_codigo}`);
    
    return enderecoParts.join(', ');
}

const statusValidos = ['em_aprovacao', 'aprovado', 'em_execucao', 'concluido', 'negado', 'cancelado'];
const statusMap = {
    'em_aprovacao': 'Em aprovação',
    'aprovado': 'Aprovado',
    'em_execucao': 'Em execução',
    'concluido': 'Concluído',
    'negado': 'Negado',
    'cancelado': 'Cancelado'
};

// Função principal para buscar contrato com relacionamentos
async function buscarContratoComRelacionamentos(client, idContrato) {
    try {
        const contratoQuery = `
            SELECT c.*, h.nome as hospedagem_nome, e.idendereco, e.numero as endereco_numero,
                   e.complemento as endereco_complemento, l.nome as logradouro_nome,
                   b.nome as bairro_nome, ci.nome as cidade_nome, es.nome as estado_nome,
                   es.sigla as estado_sigla, cep.codigo as cep_codigo,
                   u.nome as usuario_nome, u.email as usuario_email
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
        if (!contrato) return null;

        // Formatar endereço
        contrato.hospedagem_endereco = formatarEndereco(contrato);

        // Buscar pets
        const petsResult = await client.query(
            'SELECT cp.idcontrato_pet, p.idpet, p.nome, p.sexo, p.nascimento FROM contrato_pet cp JOIN pet p ON cp.idpet = p.idpet WHERE cp.idcontrato = $1',
            [idContrato]
        );
        contrato.pets = petsResult.rows;

        // Buscar serviços
        const servicosResult = await client.query(
            `SELECT cs.idcontratoservico, cs.idservico, cs.quantidade, cs.preco_unitario,
                    s.descricao, s.preco as preco_atual,
                    (cs.quantidade * cs.preco_unitario) as subtotal
             FROM contratoservico cs
             JOIN servico s ON cs.idservico = s.idservico
             WHERE cs.idcontrato = $1 ORDER BY s.descricao`,
            [idContrato]
        );
        contrato.servicos = servicosResult.rows;

        // Calcular totais e informações adicionais
        contrato.total_servicos = contrato.servicos.reduce((total, servico) => 
            total + parseFloat(servico.subtotal || 0), 0
        );
        contrato.status_descricao = statusMap[contrato.status] || 'Desconhecido';

        if (contrato.datainicio && contrato.datafim) {
            const diffTime = Math.abs(new Date(contrato.datafim) - new Date(contrato.datainicio));
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

// Funções de validação
function validarStatus(status) {
    return statusValidos.includes(status);
}

function validarDatas(dataInicio, dataFim) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (dataInicio && new Date(dataInicio) < hoje) {
        throw new Error('Data início não pode ser anterior à data atual');
    }
    
    if (dataFim && dataInicio && new Date(dataFim) < new Date(dataInicio)) {
        throw new Error('Data fim não pode ser anterior à data início');
    }
}

// Função para construir query de update dinâmica
function construirQueryUpdate(campos, idContrato) {
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(campos).forEach(([key, value]) => {
        if (value !== undefined) {
            updateFields.push(`${key} = $${paramCount}`);
            values.push(value);
            paramCount++;
        }
    });

    if (updateFields.length === 0) {
        throw new Error('Nenhum campo válido para atualização fornecido');
    }

    values.push(idContrato);
    updateFields.push('dataatualizacao = CURRENT_TIMESTAMP');

    return {
        query: `UPDATE contrato SET ${updateFields.join(', ')} WHERE idcontrato = $${paramCount} RETURNING *`,
        values
    };
}

// Controladores principais
async function lerContratos(req, res) {
    let client;
    try {
        client = await pool.connect();
        const query = `
            SELECT c.*, h.nome as hospedagem_nome, e.numero as endereco_numero,
                   e.complemento as endereco_complemento, l.nome as logradouro_nome,
                   b.nome as bairro_nome, ci.nome as cidade_nome, es.nome as estado_nome,
                   es.sigla as estado_sigla, cep.codigo as cep_codigo, u.nome as usuario_nome
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
        const contratosComEndereco = result.rows.map(contrato => ({
            ...contrato,
            hospedagem_endereco: formatarEndereco(contrato)
        }));

        const contratosCompletos = await Promise.all(
            contratosComEndereco.map(contrato => 
                buscarContratoComRelacionamentos(client, contrato.idcontrato)
            )
        );

        res.status(200).json(contratosCompletos);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao listar contratos', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function buscarContratoPorId(req, res) {
    let client;
    try {
        client = await pool.connect();
        const contratoCompleto = await buscarContratoComRelacionamentos(client, req.params.idContrato);
        
        if (!contratoCompleto) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        res.status(200).json(contratoCompleto);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar contrato', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function criarContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        await client.query('SET statement_timeout = 30000');
        await client.query('BEGIN');

        const { idHospedagem, idUsuario, status = 'em_aprovacao', dataInicio, dataFim, pets = [], servicos = [] } = req.body;

        // Validações
        if (!idHospedagem || !idUsuario || !dataInicio) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'idHospedagem, idUsuario e dataInicio são obrigatórios' });
        }

        if (!validarStatus(status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Status inválido' });
        }

        validarDatas(dataInicio, dataFim);

        // Verificações em paralelo
        const [hospedagem, usuario, petsValidos, servicosValidos, contratoIdentico] = await Promise.all([
            client.query('SELECT idhospedagem FROM hospedagem WHERE idhospedagem = $1', [idHospedagem]),
            client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]),
            pets.length > 0 ? client.query('SELECT idpet FROM pet WHERE idpet = ANY($1) AND idusuario = $2', [pets, idUsuario]) : { rows: [] },
            servicos.length > 0 ? client.query('SELECT idservico FROM servico WHERE idservico = ANY($1) AND idhospedagem = $2 AND ativo = true', [servicos.map(s => s.idservico), idHospedagem]) : { rows: [] },
            // Verificar se existe um contrato IDÊNTICO (mesma hospedagem, usuário, datas e status ativo)
            client.query(
                `SELECT idcontrato FROM contrato 
                 WHERE idhospedagem = $1 
                 AND idusuario = $2 
                 AND datainicio = $3 
                 AND COALESCE(datafim, $4) = COALESCE($4, datafim)
                 AND status IN ('em_aprovacao', 'aprovado', 'em_execucao') 
                 LIMIT 1`,
                [idHospedagem, idUsuario, dataInicio, dataFim]
            )
        ]);

        // Validações de existência
        if (hospedagem.rows.length === 0) throw new Error('Hospedagem não encontrada');
        if (usuario.rows.length === 0) throw new Error('Usuário não encontrado');
        if (pets.length > 0 && petsValidos.rows.length !== pets.length) throw new Error('Um ou mais pets não pertencem ao usuário');
        if (servicos.length > 0 && servicosValidos.rows.length !== servicos.length) throw new Error('Um ou mais serviços não estão disponíveis para esta hospedagem');
        
        // Apenas impedir contrato IDÊNTICO
        if (contratoIdentico.rows.length > 0) {
            throw new Error('Já existe um contrato idêntico ativo para este usuário e hospedagem com as mesmas datas');
        }

        // Inserir contrato
        const contratoResult = await client.query(
            'INSERT INTO contrato (idhospedagem, idusuario, status, datainicio, datafim) VALUES ($1, $2, $3, $4, $5) RETURNING idcontrato',
            [idHospedagem, idUsuario, status, dataInicio, dataFim]
        );

        const idContrato = contratoResult.rows[0].idcontrato;

        // Inserir pets em lote
        if (pets.length > 0) {
            const petsValues = pets.map(idPet => `(${idContrato}, ${idPet})`).join(',');
            await client.query(`INSERT INTO contrato_pet (idcontrato, idpet) VALUES ${petsValues}`);
        }

        // Inserir serviços em lote
        if (servicos.length > 0) {
            const servicosIds = servicos.map(s => s.idservico);
            const precosResult = await client.query('SELECT idservico, preco FROM servico WHERE idservico = ANY($1)', [servicosIds]);
            const precoMap = Object.fromEntries(precosResult.rows.map(row => [row.idservico, row.preco]));
            
            const servicosValues = servicos.map(servico => {
                const precoUnitario = precoMap[servico.idservico];
                const quantidade = servico.quantidade || 1;
                return `(${idContrato}, ${servico.idservico}, ${quantidade}, ${precoUnitario})`;
            }).join(',');
            
            await client.query(`INSERT INTO contratoservico (idcontrato, idservico, quantidade, preco_unitario) VALUES ${servicosValues}`);
        }

        await client.query('COMMIT');
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(201).json({ message: 'Contrato criado com sucesso', data: contratoCompleto });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        const statusCode = error.message.includes('timeout') ? 408 : 500;
        res.status(statusCode).json({ message: 'Erro ao criar contrato', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function atualizarContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { idHospedagem, idUsuario, status, dataInicio, dataFim } = req.body;

        // Verificar se contrato existe
        const contratoExistente = await client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (contratoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Validações
        if (status && !validarStatus(status)) {
            return res.status(400).json({ message: 'Status inválido' });
        }

        validarDatas(dataInicio, dataFim);

        // Construir e executar query
        const { query, values } = construirQueryUpdate({
            idhospedagem: idHospedagem,
            idusuario: idUsuario,
            status: status,
            datainicio: dataInicio,
            datafim: dataFim
        }, idContrato);

        await client.query(query, values);
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({ message: 'Contrato atualizado com sucesso', data: contratoCompleto });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar contrato', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

// NOVO MÉTODO: Atualizar datas do contrato
async function atualizarDatasContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { dataInicio, dataFim } = req.body;

        // Verificar se pelo menos uma data foi fornecida
        if (dataInicio === undefined && dataFim === undefined) {
            return res.status(400).json({ message: 'Pelo menos uma data (dataInicio ou dataFim) deve ser fornecida' });
        }

        // Verificar se contrato existe
        const contratoExistente = await client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (contratoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const contrato = contratoExistente.rows[0];

        // Verificar se o contrato permite edição
        const statusNaoEditaveis = ['concluido', 'cancelado', 'negado', 'em_execucao'];
        if (statusNaoEditaveis.includes(contrato.status)) {
            return res.status(400).json({ message: `Não é possível editar datas de um contrato com status "${contrato.status}"` });
        }

        // Validar datas
        validarDatas(dataInicio, dataFim);

        // Verificar se existe outro contrato IDÊNTICO (apenas se ambas as datas forem fornecidas)
        if (dataInicio !== undefined && dataFim !== undefined) {
            const contratoIdentico = await client.query(
                `SELECT idcontrato FROM contrato 
                 WHERE idhospedagem = $1 
                 AND idusuario = $2 
                 AND idcontrato != $3
                 AND datainicio = $4 
                 AND COALESCE(datafim, $5) = COALESCE($5, datafim)
                 AND status IN ('em_aprovacao', 'aprovado', 'em_execucao') 
                 LIMIT 1`,
                [contrato.idhospedagem, contrato.idusuario, idContrato, dataInicio, dataFim]
            );

            if (contratoIdentico.rows.length > 0) {
                return res.status(400).json({ message: 'Já existe um contrato idêntico ativo para este usuário e hospedagem com as mesmas datas' });
            }
        }

        // Atualizar datas
        const { query, values } = construirQueryUpdate({
            datainicio: dataInicio,
            datafim: dataFim
        }, idContrato);

        await client.query(query, values);
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: 'Datas do contrato atualizadas com sucesso',
            data: contratoCompleto,
            alteracoes: {
                dataInicio: dataInicio !== undefined,
                dataFim: dataFim !== undefined
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar datas do contrato', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function atualizarStatusContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;
        const { status } = req.body;

        if (!validarStatus(status)) {
            return res.status(400).json({ message: 'Status inválido' });
        }

        const contratoExistente = await client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (contratoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        await client.query(
            'UPDATE contrato SET status = $1, dataatualizacao = CURRENT_TIMESTAMP WHERE idcontrato = $2',
            [status, idContrato]
        );

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        res.status(200).json({ message: 'Status do contrato atualizado com sucesso', data: contratoCompleto });
    } catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar status do contrato', error: error.message });
    } finally {
        if (client) await client.release();
    }
}

async function excluirContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        const contratoExistente = await client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (contratoExistente.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);
        await client.query('DELETE FROM contrato WHERE idcontrato = $1', [idContrato]);

        res.status(200).json({ message: 'Contrato excluído com sucesso', data: contratoCompleto });
    } catch (error) {
        const message = error.code === '23503' 
            ? 'Não é possível excluir o contrato pois está sendo utilizado em outros registros'
            : 'Erro ao excluir contrato';
        res.status(error.code === '23503' ? 400 : 500).json({ message, error: error.message });
    } finally {
        if (client) await client.release();
    }
}

// Funções para serviços e pets (mantidas similares às originais)
async function excluirServicoContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idServico } = req.params;

        // Verificações de existência
        const [contrato, servico] = await Promise.all([
            client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]),
            client.query('SELECT cs.*, s.descricao FROM contratoservico cs JOIN servico s ON cs.idservico = s.idservico WHERE cs.idcontrato = $1 AND cs.idservico = $2', [idContrato, idServico])
        ]);

        if (contrato.rows.length === 0) return res.status(404).json({ message: 'Contrato não encontrado' });
        if (servico.rows.length === 0) return res.status(404).json({ message: 'Serviço não encontrado no contrato' });

        // Verificar se é o último serviço
        const servicosCount = await client.query('SELECT COUNT(*) as total FROM contratoservico WHERE idcontrato = $1', [idContrato]);
        if (parseInt(servicosCount.rows[0].total) <= 1) {
            return res.status(400).json({ 
                message: 'Não é possível remover o último serviço do contrato',
                error: 'ULTIMO_SERVICO'
            });
        }

        // Verificar se o contrato permite edição (status não editáveis)
        const contratoAtual = contrato.rows[0];
        const statusNaoEditaveis = ['concluido', 'cancelado', 'negado', 'em_execucao'];
        if (statusNaoEditaveis.includes(contratoAtual.status)) {
            return res.status(400).json({ 
                message: `Não é possível editar serviços de um contrato com status "${statusMap[contratoAtual.status] || contratoAtual.status}"`,
                error: 'STATUS_NAO_EDITAVEL'
            });
        }

        const deleteResult = await client.query(
            'DELETE FROM contratoservico WHERE idcontrato = $1 AND idservico = $2 RETURNING *',
            [idContrato, idServico]
        );

        res.status(200).json({
            message: 'Serviço removido do contrato com sucesso',
            servicoExcluido: { ...deleteResult.rows[0], descricao: servico.rows[0].descricao },
            success: true
        });
    } catch (error) {
        const statusCode = error.code === '23503' ? 400 : 500;
        const message = error.code === '23503' 
            ? 'Não é possível excluir o serviço pois está vinculado a outros registros'
            : 'Erro ao excluir serviço do contrato';
        res.status(statusCode).json({ 
            message, 
            error: error.message, 
            success: false 
        });
    } finally {
        if (client) await client.release();
    }
}

async function excluirPetContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idPet } = req.params;

        // Verificações
        const contratoResult = await client.query('SELECT * FROM contrato WHERE idcontrato = $1', [idContrato]);
        if (contratoResult.rows.length === 0) return res.status(404).json({ message: 'Contrato não encontrado' });

        const contrato = contratoResult.rows[0];
        const statusNaoEditaveis = ['concluido', 'cancelado', 'negado'];
        if (statusNaoEditaveis.includes(contrato.status)) {
            return res.status(400).json({ message: `Não é possível editar pets de um contrato com status "${contrato.status}"` });
        }

        const petResult = await client.query(
            'SELECT cp.*, p.nome FROM contrato_pet cp JOIN pet p ON cp.idpet = p.idpet WHERE cp.idcontrato = $1 AND cp.idpet = $2',
            [idContrato, idPet]
        );
        if (petResult.rows.length === 0) return res.status(404).json({ message: 'Pet não encontrado no contrato' });

        // Verificar se é o último pet
        const petsCount = await client.query('SELECT COUNT(*) as total FROM contrato_pet WHERE idcontrato = $1', [idContrato]);
        if (parseInt(petsCount.rows[0].total) <= 1) {
            return res.status(400).json({ message: 'Não é possível remover o último pet do contrato' });
        }

        const deleteResult = await client.query(
            'DELETE FROM contrato_pet WHERE idcontrato = $1 AND idpet = $2 RETURNING *',
            [idContrato, idPet]
        );

        res.status(200).json({
            message: 'Pet removido do contrato com sucesso',
            petExcluido: { ...deleteResult.rows[0], nome: petResult.rows[0].nome },
            success: true
        });
    } catch (error) {
        const statusCode = error.code === '23503' ? 400 : 500;
        const message = error.code === '23503' 
            ? 'Não é possível excluir o pet pois está vinculado a outros registros'
            : 'Erro ao excluir pet do contrato';
        res.status(statusCode).json({ message, error: error.message, success: false });
    } finally {
        if (client) await client.release();
    }
}

// NOVO MÉTODO: Alterar status do contrato com validações específicas
async function alterarStatusContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const { idContrato } = req.params;
        const { status, motivo } = req.body;

        // Validações básicas
        if (!status) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Status é obrigatório' });
        }

        if (!validarStatus(status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Status inválido' });
        }

        // Buscar contrato atual
        const contratoResult = await client.query(
            'SELECT * FROM contrato WHERE idcontrato = $1',
            [idContrato]
        );

        if (contratoResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const contratoAtual = contratoResult.rows[0];
        const statusAtual = contratoAtual.status;

        // Validar transições de status permitidas
        const transicoesPermitidas = {
            'em_aprovacao': ['aprovado', 'negado', 'cancelado'],
            'aprovado': ['em_execucao', 'cancelado'],
            'em_execucao': ['concluido', 'cancelado'],
            'concluido': [], // Não permite alteração após conclusão
            'negado': [], // Não permite alteração após negação
            'cancelado': [] // Não permite alteração após cancelamento
        };

        // Verificar se a transição é permitida
        const transicoes = transicoesPermitidas[statusAtual];
        if (!transicoes || !transicoes.includes(status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                message: `Não é possível alterar o status de "${statusMap[statusAtual]}" para "${statusMap[status]}"`,
                statusAtual: statusAtual,
                statusNovo: status,
                transicoesPermitidas: transicoesPermitidas[statusAtual]
            });
        }

        // Validações específicas por status
        switch (status) {
            case 'em_execucao':
                // Verificar se a data de início já passou
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);
                const dataInicio = new Date(contratoAtual.datainicio);
                dataInicio.setHours(0, 0, 0, 0);
                
                if (dataInicio > hoje) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ 
                        message: 'Não é possível iniciar a execução antes da data de início do contrato'
                    });
                }
                break;

            case 'concluido':
                // Verificar se a data de fim já passou (se existir)
                if (contratoAtual.datafim) {
                    const dataFim = new Date(contratoAtual.datafim);
                    dataFim.setHours(0, 0, 0, 0);
                    const hoje = new Date();
                    hoje.setHours(0, 0, 0, 0);
                    
                    if (dataFim > hoje) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({ 
                            message: 'Não é possível concluir o contrato antes da data de fim'
                        });
                    }
                }
                break;

            case 'negado':
                // Motivo é obrigatório para negar
                if (!motivo || motivo.trim().length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ 
                        message: 'Motivo é obrigatório para negar um contrato'
                    });
                }
                break;
        }

        // Atualizar o status
        const updateQuery = `
            UPDATE contrato 
            SET status = $1, dataatualizacao = CURRENT_TIMESTAMP 
            WHERE idcontrato = $2 
            RETURNING *
        `;

        const updateResult = await client.query(updateQuery, [status, idContrato]);
        
        // Se necessário, registrar o motivo (para negados)
        if (status === 'negado' && motivo) {
            // Aqui você pode criar uma tabela de log de status se necessário
            console.log(`Contrato ${idContrato} negado. Motivo: ${motivo}`);
        }

        await client.query('COMMIT');

        // Buscar contrato completo atualizado
        const contratoCompleto = await buscarContratoComRelacionamentos(client, idContrato);

        res.status(200).json({
            message: `Status do contrato alterado de "${statusMap[statusAtual]}" para "${statusMap[status]}" com sucesso`,
            data: contratoCompleto,
            alteracao: {
                de: statusAtual,
                para: status,
                descricao: `De ${statusMap[statusAtual]} para ${statusMap[status]}`
            }
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Erro ao alterar status do contrato:', error);
        res.status(500).json({ 
            message: 'Erro ao alterar status do contrato', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
}

// Método para obter transições de status permitidas
async function obterTransicoesStatus(req, res) {
    let client;
    try {
        const { idContrato } = req.params;

        client = await pool.connect();
        
        const contratoResult = await client.query(
            'SELECT status FROM contrato WHERE idcontrato = $1',
            [idContrato]
        );

        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const statusAtual = contratoResult.rows[0].status;

        const transicoesPermitidas = {
            'em_aprovacao': ['aprovado', 'negado', 'cancelado'],
            'aprovado': ['em_execucao', 'cancelado'],
            'em_execucao': ['concluido', 'cancelado'],
            'concluido': [],
            'negado': [],
            'cancelado': []
        };

        const transicoes = transicoesPermitidas[statusAtual] || [];

        res.status(200).json({
            statusAtual: statusAtual,
            descricaoStatusAtual: statusMap[statusAtual],
            transicoesPermitidas: transicoes.map(status => ({
                status: status,
                descricao: statusMap[status]
            })),
            todasOpcoes: statusValidos.map(status => ({
                status: status,
                descricao: statusMap[status],
                permitido: transicoes.includes(status)
            }))
        });

    } catch (error) {
        console.error('Erro ao obter transições de status:', error);
        res.status(500).json({ 
            message: 'Erro ao obter transições de status', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
}

// NOVO MÉTODO: Calcular valor total do contrato baseado na diária da hospedagem
async function calcularValorContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // Buscar contrato com informações da hospedagem
        const contratoQuery = `
            SELECT 
                c.idcontrato,
                c.datainicio,
                c.datafim,
                h.idhospedagem,
                h.nome as hospedagem_nome,
                h.valor_diaria,
                COUNT(cp.idpet) as quantidade_pets
            FROM contrato c
            JOIN hospedagem h ON c.idhospedagem = h.idhospedagem
            LEFT JOIN contrato_pet cp ON c.idcontrato = cp.idcontrato
            WHERE c.idcontrato = $1
            GROUP BY c.idcontrato, h.idhospedagem, h.nome, h.valor_diaria
        `;

        const contratoResult = await client.query(contratoQuery, [idContrato]);
        
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const contrato = contratoResult.rows[0];

        // Validar se tem valor_diaria configurado
        if (!contrato.valor_diaria || contrato.valor_diaria <= 0) {
            return res.status(400).json({ 
                message: 'Hospedagem não possui valor de diária configurado',
                error: 'VALOR_DIARIA_NAO_CONFIGURADO'
            });
        }

        // Validar datas
        if (!contrato.datainicio) {
            return res.status(400).json({ 
                message: 'Contrato não possui data de início definida',
                error: 'DATA_INICIO_NAO_DEFINIDA'
            });
        }

        // Calcular quantidade de dias
        let quantidadeDias = 1; // padrão 1 dia se não tiver data fim
        
        if (contrato.datafim) {
            const dataInicio = new Date(contrato.datainicio);
            const dataFim = new Date(contrato.datafim);
            
            // Validar se data fim é maior que data início
            if (dataFim <= dataInicio) {
                return res.status(400).json({ 
                    message: 'Data fim deve ser posterior à data início',
                    error: 'DATA_FIM_INVALIDA'
                });
            }

            // Calcular diferença em dias
            const diffTime = Math.abs(dataFim - dataInicio);
            quantidadeDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Garantir pelo menos 1 dia
            quantidadeDias = Math.max(1, quantidadeDias);
        }

        // Calcular valores
        const valorDiaria = parseFloat(contrato.valor_diaria);
        const valorTotalHospedagem = valorDiaria * quantidadeDias;
        const quantidadePets = parseInt(contrato.quantidade_pets) || 0;

        // Buscar serviços adicionais
        const servicosQuery = `
            SELECT 
                cs.idservico,
                cs.quantidade,
                cs.preco_unitario,
                s.descricao,
                (cs.quantidade * cs.preco_unitario) as subtotal
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            WHERE cs.idcontrato = $1
            ORDER BY s.descricao
        `;

        const servicosResult = await client.query(servicosQuery, [idContrato]);
        const servicos = servicosResult.rows;

        // Calcular total de serviços
        const totalServicos = servicos.reduce((total, servico) => 
            total + parseFloat(servico.subtotal || 0), 0
        );

        // Calcular valor total do contrato
        const valorTotalContrato = valorTotalHospedagem + totalServicos;

        // Formatar resposta
        const resposta = {
            contrato: {
                id: contrato.idcontrato,
                dataInicio: contrato.datainicio,
                dataFim: contrato.datafim,
                quantidadeDias: quantidadeDias,
                quantidadePets: quantidadePets
            },
            hospedagem: {
                id: contrato.idhospedagem,
                nome: contrato.hospedagem_nome,
                valorDiaria: valorDiaria
            },
            calculoHospedagem: {
                valorDiaria: valorDiaria,
                quantidadeDias: quantidadeDias,
                subtotal: valorTotalHospedagem,
                descricao: `${quantidadeDias} diária(s) × R$ ${valorDiaria.toFixed(2)}`
            },
            servicos: {
                itens: servicos,
                total: totalServicos,
                quantidade: servicos.length
            },
            totais: {
                subtotalHospedagem: valorTotalHospedagem,
                subtotalServicos: totalServicos,
                valorTotal: valorTotalContrato
            },
            formatado: {
                valorDiaria: `R$ ${valorDiaria.toFixed(2).replace('.', ',')}`,
                subtotalHospedagem: `R$ ${valorTotalHospedagem.toFixed(2).replace('.', ',')}`,
                subtotalServicos: `R$ ${totalServicos.toFixed(2).replace('.', ',')}`,
                valorTotal: `R$ ${valorTotalContrato.toFixed(2).replace('.', ',')}`,
                periodo: `${quantidadeDias} dia(s)`
            }
        };

        res.status(200).json(resposta);

    } catch (error) {
        console.error('Erro ao calcular valor do contrato:', error);
        res.status(500).json({ 
            message: 'Erro ao calcular valor do contrato', 
            error: error.message 
        });
    } finally {
        if (client) await client.release();
    }
}

module.exports = {
    lerContratos,
    buscarContratoPorId,
    criarContrato,
    atualizarContrato,
    atualizarDatasContrato, // NOVO MÉTODO
    atualizarStatusContrato,
    excluirContrato,
    buscarContratosPorUsuario: async (req, res) => {
        // Implementação similar às outras, mas focada em usuário específico
        let client;
        try {
            client = await pool.connect();
            const { idUsuario } = req.params;
            
            const usuario = await client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]);
            if (usuario.rows.length === 0) return res.status(404).json({ message: 'Usuário não encontrado' });

            const query = `
                SELECT c.*, h.nome as hospedagem_nome, e.numero as endereco_numero,
                       e.complemento as endereco_complemento, l.nome as logradouro_nome,
                       b.nome as bairro_nome, ci.nome as cidade_nome, es.nome as estado_nome,
                       es.sigla as estado_sigla, cep.codigo as cep_codigo
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
            const contratosComEndereco = result.rows.map(contrato => ({
                ...contrato,
                hospedagem_endereco: formatarEndereco(contrato)
            }));

            const contratosCompletos = await Promise.all(
                contratosComEndereco.map(contrato => 
                    buscarContratoComRelacionamentos(client, contrato.idcontrato)
                )
            );

            res.status(200).json(contratosCompletos);
        } catch (error) {
            res.status(500).json({ message: 'Erro ao buscar contratos do usuário', error: error.message });
        } finally {
            if (client) await client.release();
        }
    },
    buscarContratosPorUsuarioEStatus: async (req, res) => {
        // Implementação similar, mas com filtro de status
        let client;
        try {
            client = await pool.connect();
            const { idUsuario, status } = req.query;

            if (!idUsuario) return res.status(400).json({ message: 'idUsuario é obrigatório' });

            const usuario = await client.query('SELECT idusuario FROM usuario WHERE idusuario = $1', [idUsuario]);
            if (usuario.rows.length === 0) return res.status(404).json({ message: 'Usuário não encontrado' });

            let query = `
                SELECT c.*, h.nome as hospedagem_nome, e.numero as endereco_numero,
                       e.complemento as endereco_complemento, l.nome as logradouro_nome,
                       b.nome as bairro_nome, ci.nome as cidade_nome, es.nome as estado_nome,
                       es.sigla as estado_sigla, cep.codigo as cep_codigo
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
            if (status) {
                if (!validarStatus(status)) {
                    return res.status(400).json({ message: 'Status inválido' });
                }
                query += ` AND c.status = $2`;
                values.push(status);
            }

            query += ` ORDER BY c.datainicio DESC, c.datacriacao DESC`;

            const result = await client.query(query, values);
            const contratosComEndereco = result.rows.map(contrato => ({
                ...contrato,
                hospedagem_endereco: formatarEndereco(contrato)
            }));

            const contratosCompletos = await Promise.all(
                contratosComEndereco.map(contrato => 
                    buscarContratoComRelacionamentos(client, contrato.idcontrato)
                )
            );

            res.status(200).json(contratosCompletos);
        } catch (error) {
            res.status(500).json({ message: 'Erro ao buscar contratos do usuário', error: error.message });
        } finally {
            if (client) await client.release();
        }
    },
    excluirServicoContrato,
    excluirPetContrato,
    buscarContratoComRelacionamentos,
    alterarStatusContrato,
    obterTransicoesStatus,
    calcularValorContrato
};