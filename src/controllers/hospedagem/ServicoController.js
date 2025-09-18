const pgconnection = require('../../connections/SQLConnections.js');

async function listarServicosPorHospedagem(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idHospedagem } = req.params;

        const query = `
            SELECT 
                s.idServico,
                s.descricao,
                s.preco
            FROM Servico s
            WHERE s.idHospedagem = $1
            ORDER BY s.descricao
        `;

        const result = await client.query(query, [idHospedagem]);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar serviços da hospedagem',
            error: error.message
        });
        console.error('Erro ao listar serviços:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function adicionarServicoAHospedagem(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idHospedagem } = req.params;
        const { descricao, preco } = req.body;

        // Validações
        if (!descricao || preco === undefined) {
            return res.status(400).json({
                message: 'descricao e preco são obrigatórios'
            });
        }

        if (isNaN(preco) || preco < 0) {
            return res.status(400).json({
                message: 'Preço deve ser um número positivo'
            });
        }

        // Verificar se a hospedagem existe
        const hospedagemResult = await client.query(
            'SELECT 1 FROM Hospedagem WHERE idHospedagem = $1', 
            [idHospedagem]
        );
        
        if (hospedagemResult.rows.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        // Inserir o novo serviço e retornar os dados
        const result = await client.query(
            `INSERT INTO Servico (idHospedagem, descricao, preco) 
             VALUES ($1, $2, $3) 
             RETURNING idServico, descricao, preco`,
            [idHospedagem, descricao, preco]
        );

        res.status(201).json({
            message: 'Serviço criado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar serviço',
            error: error.message
        });
        console.error('Erro ao criar serviço:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function atualizarServico(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idServico } = req.params;
        const { descricao, preco } = req.body;

        // Validações
        if (!descricao && !preco) {
            return res.status(400).json({
                message: 'Pelo menos um campo (descricao ou preco) deve ser fornecido'
            });
        }

        if (preco !== undefined && (isNaN(preco) || preco < 0)) {
            return res.status(400).json({
                message: 'Preço deve ser um número positivo'
            });
        }

        // Verificar se o serviço existe
        const servicoResult = await client.query(
            'SELECT 1 FROM Servico WHERE idServico = $1', 
            [idServico]
        );
        
        if (servicoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        // Construir a query dinamicamente
        let query = 'UPDATE Servico SET ';
        const params = [];
        let paramCount = 1;

        if (descricao) {
            query += `descricao = $${paramCount}`;
            params.push(descricao);
            paramCount++;
        }

        if (preco !== undefined) {
            if (paramCount > 1) query += ', ';
            query += `preco = $${paramCount}`;
            params.push(preco);
            paramCount++;
        }

        query += ` WHERE idServico = $${paramCount} RETURNING idServico, descricao, preco`;
        params.push(idServico);

        // Executar a atualização
        const result = await client.query(query, params);

        res.status(200).json({
            message: 'Serviço atualizado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar serviço',
            error: error.message
        });
        console.error('Erro ao atualizar serviço:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function removerServico(req, res) {
    let client;
    try {
        client = await pgconnection();
        const { idServico } = req.params;

        // Verificar se o serviço existe
        const servicoResult = await client.query(
            'SELECT 1 FROM Servico WHERE idServico = $1', 
            [idServico]
        );
        
        if (servicoResult.rows.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        // Remover o serviço
        await client.query('DELETE FROM Servico WHERE idServico = $1', [idServico]);

        res.status(200).json({
            message: 'Serviço removido com sucesso'
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao remover serviço',
            error: error.message
        });
        console.error('Erro ao remover serviço:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    listarServicosPorHospedagem,
    adicionarServicoAHospedagem,
    atualizarServico,
    removerServico
};