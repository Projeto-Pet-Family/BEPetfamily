const sqlconnection = require('../../../connections/SQLConnections.js');

async function lerBairros(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        
        // Adiciona filtro por cidade se fornecido
        const { cidadeId } = req.query;
        let query = `
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
        `;
        const params = [];
        
        if (cidadeId) {
            query += ' WHERE b.idCidade = ?';
            params.push(cidadeId);
        }
        
        query += ' ORDER BY b.nome';
        
        const [result] = await sql.query(query, params);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar bairros',
            error: error.message
        });
        console.error('Erro ao listar bairros:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarBairroPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idBairro } = req.params;
        
        const [result] = await sql.query(`
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE b.idBairro = ?
        `, [idBairro]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Bairro não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar bairro',
            error: error.message
        });
        console.error('Erro ao buscar bairro:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarBairro(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            nome,
            idCidade
        } = req.body;

        // Validar campos obrigatórios
        if (!nome || !idCidade) {
            return res.status(400).json({
                message: 'Nome e ID da cidade são campos obrigatórios'
            });
        }

        // Verificar se a cidade existe
        const [cidade] = await sql.query('SELECT 1 FROM Cidade WHERE idCidade = ?', [idCidade]);
        if (cidade.length === 0) {
            return res.status(400).json({
                message: 'Cidade não encontrada'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO Bairro (nome, idCidade) VALUES (?, ?)',
            [nome, idCidade]
        );

        // Buscar os dados completos do bairro criado
        const [novoBairro] = await sql.query(`
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE b.idBairro = ?
        `, [result.insertId]);

        res.status(201).json({
            message: 'Bairro criado com sucesso',
            data: novoBairro[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (bairro já existe na cidade)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um bairro com este nome na cidade selecionada'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar bairro',
            error: error.message
        });
        console.error('Erro ao criar bairro:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarBairro(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idBairro } = req.params;

        const {
            nome,
            idCidade
        } = req.body;

        // Verificar se o bairro existe
        const [bairro] = await sql.query('SELECT * FROM Bairro WHERE idBairro = ?', [idBairro]);
        if (bairro.length === 0) {
            return res.status(404).json({ message: 'Bairro não encontrado' });
        }

        // Verificar se a nova cidade existe, se for fornecida
        if (idCidade) {
            const [cidade] = await sql.query('SELECT 1 FROM Cidade WHERE idCidade = ?', [idCidade]);
            if (cidade.length === 0) {
                return res.status(400).json({
                    message: 'Cidade não encontrada'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (nome) updateFields.nome = nome;
        if (idCidade) updateFields.idCidade = idCidade;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Bairro SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idBairro = ?';
        values.push(idBairro);

        await sql.query(query, values);

        // Buscar o bairro atualizado
        const [updatedBairro] = await sql.query(`
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE b.idBairro = ?
        `, [idBairro]);

        res.status(200).json({
            message: 'Bairro atualizado com sucesso',
            data: updatedBairro[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (bairro já existe na cidade)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um bairro com este nome na cidade selecionada'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar bairro',
            error: error.message
        });
        console.error('Erro ao atualizar bairro:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirBairro(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idBairro } = req.params;

        // Verificar se o bairro existe
        const [bairro] = await sql.query(`
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE b.idBairro = ?
        `, [idBairro]);
        
        if (bairro.length === 0) {
            return res.status(404).json({ message: 'Bairro não encontrado' });
        }

        await sql.query('DELETE FROM Bairro WHERE idBairro = ?', [idBairro]);

        res.status(200).json({
            message: 'Bairro excluído com sucesso',
            data: bairro[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                message: 'Não é possível excluir o bairro pois está sendo utilizado em logradouros'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir bairro',
            error: error.message
        });
        console.error('Erro ao excluir bairro:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerBairros,
    buscarBairroPorId,
    criarBairro,
    atualizarBairro,
    excluirBairro
};