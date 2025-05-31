const sqlconnection = require('../../../connections/SQLConnections.js');

async function lerLogradouros(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        
        // Adiciona filtro por bairro se fornecido
        const { bairroId } = req.query;
        let query = `
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
        `;
        const params = [];
        
        if (bairroId) {
            query += ' WHERE l.idBairro = ?';
            params.push(bairroId);
        }
        
        query += ' ORDER BY l.nome';
        
        const [result] = await sql.query(query, params);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar logradouros',
            error: error.message
        });
        console.error('Erro ao listar logradouros:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarLogradouroPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idLogradouro } = req.params;
        
        const [result] = await sql.query(`
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE l.idLogradouro = ?
        `, [idLogradouro]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Logradouro não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar logradouro',
            error: error.message
        });
        console.error('Erro ao buscar logradouro:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarLogradouro(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            nome,
            idBairro
        } = req.body;

        // Validar campos obrigatórios
        if (!nome || !idBairro) {
            return res.status(400).json({
                message: 'Nome e ID do bairro são campos obrigatórios'
            });
        }

        // Verificar se o bairro existe
        const [bairro] = await sql.query('SELECT 1 FROM Bairro WHERE idBairro = ?', [idBairro]);
        if (bairro.length === 0) {
            return res.status(400).json({
                message: 'Bairro não encontrado'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO Logradouro (nome, idBairro) VALUES (?, ?)',
            [nome, idBairro]
        );

        // Buscar os dados completos do logradouro criado
        const [novoLogradouro] = await sql.query(`
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE l.idLogradouro = ?
        `, [result.insertId]);

        res.status(201).json({
            message: 'Logradouro criado com sucesso',
            data: novoLogradouro[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (logradouro já existe no bairro)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um logradouro com este nome no bairro selecionado'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar logradouro',
            error: error.message
        });
        console.error('Erro ao criar logradouro:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarLogradouro(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idLogradouro } = req.params;

        const {
            nome,
            idBairro
        } = req.body;

        // Verificar se o logradouro existe
        const [logradouro] = await sql.query('SELECT * FROM Logradouro WHERE idLogradouro = ?', [idLogradouro]);
        if (logradouro.length === 0) {
            return res.status(404).json({ message: 'Logradouro não encontrado' });
        }

        // Verificar se o novo bairro existe, se for fornecido
        if (idBairro) {
            const [bairro] = await sql.query('SELECT 1 FROM Bairro WHERE idBairro = ?', [idBairro]);
            if (bairro.length === 0) {
                return res.status(400).json({
                    message: 'Bairro não encontrado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (nome) updateFields.nome = nome;
        if (idBairro) updateFields.idBairro = idBairro;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Logradouro SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idLogradouro = ?';
        values.push(idLogradouro);

        await sql.query(query, values);

        // Buscar o logradouro atualizado
        const [updatedLogradouro] = await sql.query(`
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE l.idLogradouro = ?
        `, [idLogradouro]);

        res.status(200).json({
            message: 'Logradouro atualizado com sucesso',
            data: updatedLogradouro[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (logradouro já existe no bairro)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um logradouro com este nome no bairro selecionado'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar logradouro',
            error: error.message
        });
        console.error('Erro ao atualizar logradouro:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirLogradouro(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idLogradouro } = req.params;

        // Verificar se o logradouro existe
        const [logradouro] = await sql.query(`
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l.idBairro = b.idBairro
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE l.idLogradouro = ?
        `, [idLogradouro]);
        
        if (logradouro.length === 0) {
            return res.status(404).json({ message: 'Logradouro não encontrado' });
        }

        await sql.query('DELETE FROM Logradouro WHERE idLogradouro = ?', [idLogradouro]);

        res.status(200).json({
            message: 'Logradouro excluído com sucesso',
            data: logradouro[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                message: 'Não é possível excluir o logradouro pois está sendo utilizado em CEPs ou Endereços'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir logradouro',
            error: error.message
        });
        console.error('Erro ao excluir logradouro:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerLogradouros,
    buscarLogradouroPorId,
    criarLogradouro,
    atualizarLogradouro,
    excluirLogradouro
};