const pool = require('../../connections/SQLConnections.js');

async function adicionarServicoContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato, idServico, quantidade = 1 } = req.body;

        // Validações
        if (!idContrato || !idServico) {
            return res.status(400).json({
                message: 'idContrato e idServico são obrigatórios'
            });
        }

        if (quantidade <= 0) {
            return res.status(400).json({
                message: 'Quantidade deve ser maior que zero'
            });
        }

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT idcontrato FROM contrato WHERE idcontrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        // Verificar se o serviço existe e está ativo
        const servicoResult = await client.query(
            'SELECT preco FROM servico WHERE idservico = $1 AND ativo = true', 
            [idServico]
        );
        if (servicoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado ou inativo' });
        }

        const precoUnitario = servicoResult.rows[0].preco;

        // Verificar se o serviço já está no contrato
        const existeResult = await client.query(
            'SELECT idcontratoservico FROM contratoservico WHERE idcontrato = $1 AND idservico = $2',
            [idContrato, idServico]
        );
        if (existeResult.rows.length > 0) {
            return res.status(400).json({ message: 'Serviço já está adicionado a este contrato' });
        }

        // Inserir relação
        const result = await client.query(
            `INSERT INTO contratoservico (idcontrato, idservico, quantidade, preco_unitario) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [idContrato, idServico, quantidade, precoUnitario]
        );

        res.status(201).json({
            message: 'Serviço adicionado ao contrato com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao adicionar serviço ao contrato',
            error: error.message
        });
        console.error('Erro ao adicionar serviço ao contrato:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

async function atualizarServicoContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContratoServico } = req.params;
        const { quantidade } = req.body;

        // Validações
        if (quantidade <= 0) {
            return res.status(400).json({
                message: 'Quantidade deve ser maior que zero'
            });
        }

        // Verificar se a relação existe
        const relacaoResult = await client.query(
            'SELECT * FROM contratoservico WHERE idcontratoservico = $1', 
            [idContratoServico]
        );
        if (relacaoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Relação contrato-serviço não encontrada' });
        }

        // Atualizar quantidade
        const result = await client.query(
            `UPDATE contratoservico 
             SET quantidade = $1, dataatualizacao = CURRENT_TIMESTAMP
             WHERE idcontratoservico = $2 
             RETURNING *`,
            [quantidade, idContratoServico]
        );

        res.status(200).json({
            message: 'Serviço do contrato atualizado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar serviço do contrato',
            error: error.message
        });
        console.error('Erro ao atualizar serviço do contrato:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

async function removerServicoContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContratoServico } = req.params;

        // Verificar se a relação existe
        const relacaoResult = await client.query(
            'SELECT * FROM contratoservico WHERE idcontratoservico = $1', 
            [idContratoServico]
        );
        if (relacaoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Relação contrato-serviço não encontrada' });
        }

        await client.query('DELETE FROM contratoservico WHERE idcontratoservico = $1', [idContratoServico]);

        res.status(200).json({
            message: 'Serviço removido do contrato com sucesso',
            data: relacaoResult.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao remover serviço do contrato',
            error: error.message
        });
        console.error('Erro ao remover serviço do contrato:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

async function listarServicosContrato(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContrato } = req.params;

        // Verificar se o contrato existe
        const contratoResult = await client.query(
            'SELECT idcontrato FROM contrato WHERE idcontrato = $1', 
            [idContrato]
        );
        if (contratoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Contrato não encontrado' });
        }

        const query = `
            SELECT 
                cs.idcontratoservico,
                cs.idcontrato,
                cs.idservico,
                cs.quantidade,
                cs.preco_unitario,
                cs.datacriacao,
                cs.dataatualizacao,
                s.descricao as servico_descricao,
                s.preco as preco_atual,
                s.duracao,
                (cs.quantidade * cs.preco_unitario) as subtotal
            FROM contratoservico cs
            JOIN servico s ON cs.idservico = s.idservico
            WHERE cs.idcontrato = $1
            ORDER BY s.descricao
        `;

        const result = await client.query(query, [idContrato]);

        res.status(200).json(result.rows);

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar serviços do contrato',
            error: error.message
        });
        console.error('Erro ao listar serviços do contrato:', error);
    } finally {
        if (client) {
            await client.release();
        }
    }
}

// Métodos antigos (mantidos para compatibilidade)
async function lerContratosServico(req, res) {
    let client;
    try {
        client = await pool.connect();
        const result = await client.query('SELECT * FROM contratoservico');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Erro ao ler contratos serviços:', error);
        res.status(500).json({
            message: 'Erro ao buscar contratos serviços',
            error: error.message
        });
    } finally {
        if (client) await client.release();
    }
}

async function buscarContratoServicoPorId(req, res) {
    let client;
    try {
        client = await pool.connect();
        const { idContratoServico } = req.params;
        const result = await client.query(
            'SELECT * FROM contratoservico WHERE idcontratoservico = $1', 
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
        if (client) await client.release();
    }
}

module.exports = {
    // Novos métodos
    adicionarServicoContrato,
    atualizarServicoContrato,
    removerServicoContrato,
    listarServicosContrato,
    
    // Métodos antigos
    lerContratosServico,
    buscarContratoServicoPorId,
    inserirContratoServico: adicionarServicoContrato, // Alias para compatibilidade
    atualizarContratoServico: atualizarServicoContrato, // Alias para compatibilidade
    excluirContratoServico: removerServicoContrato // Alias para compatibilidade
};