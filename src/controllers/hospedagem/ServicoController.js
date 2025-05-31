const sqlconnection = require('../../connections/SQLConnections.js');

async function listarServicosPorHospedagem(req, res) {
    let sql;
    try {
        sql = await sqlconnection();
        const { idHospedagem } = req.params;

        const query = `
            SELECT 
                hs.idHospedagemServico,
                s.idServico,
                s.descricao,
                s.categoria,
                hs.preco,
                hs.ativo,
                hs.observacoes
            FROM HospedagemServico hs
            JOIN Servico s ON hs.idServico = s.idServico
            WHERE hs.idHospedagem = ?
            ORDER BY s.categoria, s.descricao
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
        const { idServico, preco, observacoes } = req.body;

        // Validações
        if (!idServico || preco === undefined) {
            return res.status(400).json({
                message: 'idServico e preco são obrigatórios'
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

        // Verificar se o serviço existe
        const [servico] = await sql.query('SELECT 1 FROM Servico WHERE idServico = ?', [idServico]);
        if (servico.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        // Inserir o serviço para a hospedagem
        const [result] = await sql.query(
            'INSERT INTO HospedagemServico (idHospedagem, idServico, preco, observacoes) VALUES (?, ?, ?, ?)',
            [idHospedagem, idServico, preco, observacoes || null]
        );

        // Buscar o registro criado
        const [novoServico] = await sql.query(`
            SELECT 
                hs.idHospedagemServico,
                s.idServico,
                s.descricao,
                s.categoria,
                hs.preco,
                hs.ativo,
                hs.observacoes
            FROM HospedagemServico hs
            JOIN Servico s ON hs.idServico = s.idServico
            WHERE hs.idHospedagemServico = ?
        `, [result.insertId]);

        res.status(201).json({
            message: 'Serviço adicionado à hospedagem com sucesso',
            data: novoServico[0]
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Este serviço já está cadastrado para esta hospedagem'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao adicionar serviço à hospedagem',
            error: error.message
        });
        console.error('Erro ao adicionar serviço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

// Outras funções do controller (atualizar, remover, etc.)
module.exports = {
    listarServicosPorHospedagem,
    adicionarServicoAHospedagem
    // ... outras funções
};