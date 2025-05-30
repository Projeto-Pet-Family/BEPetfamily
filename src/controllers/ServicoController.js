const sqlconnection = require('../connections/SQLConnections.js');

async function lerServicos(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const [result] = await sql.query('SELECT * FROM Servico');
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar serviços',
            error: error.message
        });
        console.error('Erro ao listar serviços:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarServicoPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idServico } = req.params;
        const [result] = await sql.query('SELECT * FROM Servico WHERE idServico = ?', [idServico]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar serviço',
            error: error.message
        });
        console.error('Erro ao buscar serviço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarServico(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            descricao,
            preco
        } = req.body;

        // Validar campos obrigatórios
        if (!descricao || preco === undefined) {
            return res.status(400).json({
                message: 'Descrição e preço são campos obrigatórios'
            });
        }

        // Validar preço
        if (isNaN(preco) || preco < 0) {
            return res.status(400).json({
                message: 'Preço deve ser um número positivo'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO Servico (descricao, preco) VALUES (?, ?)',
            [descricao, preco]
        );

        const novoServico = {
            idServico: result.insertId,
            descricao,
            preco
        };

        res.status(201).json({
            message: 'Serviço criado com sucesso',
            data: novoServico
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

        const {
            descricao,
            preco
        } = req.body;

        // Verificar se o serviço existe
        const [servico] = await sql.query('SELECT * FROM Servico WHERE idServico = ?', [idServico]);
        if (servico.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        // Validar preço se for fornecido
        if (preco !== undefined && (isNaN(preco) || preco < 0)) {
            return res.status(400).json({
                message: 'Preço deve ser um número positivo'
            });
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (descricao) updateFields.descricao = descricao;
        if (preco !== undefined) updateFields.preco = preco;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Servico SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idServico = ?';
        values.push(idServico);

        await sql.query(query, values);

        // Buscar o serviço atualizado
        const [updatedServico] = await sql.query('SELECT * FROM Servico WHERE idServico = ?', [idServico]);

        res.status(200).json({
            message: 'Serviço atualizado com sucesso',
            data: updatedServico[0]
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

async function excluirServico(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idServico } = req.params;

        // Verificar se o serviço existe
        const [servico] = await sql.query('SELECT * FROM Servico WHERE idServico = ?', [idServico]);
        if (servico.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        await sql.query('DELETE FROM Servico WHERE idServico = ?', [idServico]);

        res.status(200).json({
            message: 'Serviço excluído com sucesso',
            data: servico[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                message: 'Não é possível excluir o serviço pois está sendo utilizado em outros registros'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir serviço',
            error: error.message
        });
        console.error('Erro ao excluir serviço:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerServicos,
    buscarServicoPorId,
    criarServico,
    atualizarServico,
    excluirServico
};