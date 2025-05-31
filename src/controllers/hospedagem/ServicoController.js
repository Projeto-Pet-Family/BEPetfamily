const sqlconnection = require('../../connections/SQLConnections.js');

async function listarServicosPorHospedagem(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idHospedagem } = req.params;

        const query = `
            SELECT 
                s.idServico,
                s.descricao,
                s.preco
            FROM Servico s
            WHERE s.idHospedagem = ?
            ORDER BY s.descricao
        `;

        const [result] = await sql.query(query, [idHospedagem]);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar serviços da hospedagem',
            error: error.message
        });
        console.error('Erro ao listar serviços:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function adicionarServicoAHospedagem(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
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
        const [hospedagem] = await sql.query('SELECT 1 FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);
        if (hospedagem.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        // Inserir o novo serviço
        const [result] = await sql.query(
            'INSERT INTO Servico (idHospedagem, descricao, preco) VALUES (?, ?, ?)',
            [idHospedagem, descricao, preco]
        );

        // Buscar o registro criado
        const [novoServico] = await sql.query(`
            SELECT 
                idServico,
                descricao,
                preco
            FROM Servico
            WHERE idServico = ?
        `, [result.insertId]);

        res.status(201).json({
            message: 'Serviço criado com sucesso',
            data: novoServico[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar serviço',
            error: error.message
        });
        console.error('Erro ao criar serviço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarServico(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
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
        const [servico] = await sql.query('SELECT 1 FROM Servico WHERE idServico = ?', [idServico]);
        if (servico.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        // Atualizar o serviço
        await sql.query(
            'UPDATE Servico SET descricao = COALESCE(?, descricao), preco = COALESCE(?, preco) WHERE idServico = ?',
            [descricao, preco, idServico]
        );

        // Buscar o registro atualizado
        const [servicoAtualizado] = await sql.query(`
            SELECT 
                idServico,
                descricao,
                preco
            FROM Servico
            WHERE idServico = ?
        `, [idServico]);

        res.status(200).json({
            message: 'Serviço atualizado com sucesso',
            data: servicoAtualizado[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar serviço',
            error: error.message
        });
        console.error('Erro ao atualizar serviço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function removerServico(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idServico } = req.params;

        // Verificar se o serviço existe
        const [servico] = await sql.query('SELECT 1 FROM Servico WHERE idServico = ?', [idServico]);
        if (servico.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        // Remover o serviço
        await sql.query('DELETE FROM Servico WHERE idServico = ?', [idServico]);

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
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    listarServicosPorHospedagem,
    adicionarServicoAHospedagem,
    atualizarServico,
    removerServico
};