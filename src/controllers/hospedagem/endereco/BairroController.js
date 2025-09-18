const pool = require('../../../connections/SQLConnections.js');

async function lerBairros(req, res) {
    let client;

    try {
        client = await pool.connect();
        
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
            query += ' WHERE b.idCidade = $1';
            params.push(cidadeId);
        }
        
        query += ' ORDER BY b.nome';
        
        const result = await client.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar bairros',
            error: error.message
        });
        console.error('Erro ao listar bairros:', error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function buscarBairroPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idBairro } = req.params;
        
        const result = await client.query(`
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE b.idBairro = $1
        `, [idBairro]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Bairro não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar bairro',
            error: error.message
        });
        console.error('Erro ao buscar bairro:', error);
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function criarBairro(req, res) {
    let client;

    try {
        client = await pool.connect();

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
        const cidadeResult = await client.query('SELECT 1 FROM Cidade WHERE idCidade = $1', [idCidade]);
        if (cidadeResult.rows.length === 0) {
            return res.status(400).json({
                message: 'Cidade não encontrada'
            });
        }

        // Inserir no banco de dados com RETURNING
        const result = await client.query(
            'INSERT INTO Bairro (nome, idCidade) VALUES ($1, $2) RETURNING *',
            [nome, idCidade]
        );

        // Buscar os dados completos do bairro criado
        const bairroCompleto = await client.query(`
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE b.idBairro = $1
        `, [result.rows[0].idbairro]);

        res.status(201).json({
            message: 'Bairro criado com sucesso',
            data: bairroCompleto.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (bairro já existe na cidade) - PostgreSQL: 23505
        if (error.code === '23505') {
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
        if (client) {
            client.release();
        }
    }
}

async function atualizarBairro(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idBairro } = req.params;

        const {
            nome,
            idCidade
        } = req.body;

        // Verificar se o bairro existe
        const bairroResult = await client.query('SELECT * FROM Bairro WHERE idBairro = $1', [idBairro]);
        if (bairroResult.rows.length === 0) {
            return res.status(404).json({ message: 'Bairro não encontrado' });
        }

        // Verificar se a nova cidade existe, se for fornecida
        if (idCidade) {
            const cidadeResult = await client.query('SELECT 1 FROM Cidade WHERE idCidade = $1', [idCidade]);
            if (cidadeResult.rows.length === 0) {
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
        let paramCount = 1;
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = $${paramCount}`);
            values.push(value);
            paramCount++;
        }
        
        query += setClauses.join(', ');
        query += ` WHERE idBairro = $${paramCount} RETURNING *`;
        values.push(idBairro);

        const result = await client.query(query, values);

        // Buscar o bairro atualizado com joins
        const bairroCompleto = await client.query(`
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE b.idBairro = $1
        `, [idBairro]);

        res.status(200).json({
            message: 'Bairro atualizado com sucesso',
            data: bairroCompleto.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (bairro já existe na cidade) - PostgreSQL: 23505
        if (error.code === '23505') {
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
        if (client) {
            client.release();
        }
    }
}

async function excluirBairro(req, res) {
    let client;
    
    try {
        client = await pool.connect();
        const { idBairro } = req.params;

        // Verificar se o bairro existe
        const bairroResult = await client.query(`
            SELECT b.*, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Bairro b 
            JOIN Cidade c ON b.idCidade = c.idCidade
            JOIN Estado e ON c.idEstado = e.idEstado
            WHERE b.idBairro = $1
        `, [idBairro]);
        
        if (bairroResult.rows.length === 0) {
            return res.status(404).json({ message: 'Bairro não encontrado' });
        }

        const deleteResult = await client.query(
            'DELETE FROM Bairro WHERE idBairro = $1 RETURNING *',
            [idBairro]
        );

        res.status(200).json({
            message: 'Bairro excluído com sucesso',
            data: bairroResult.rows[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira - PostgreSQL: 23503
        if (error.code === '23503') {
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
        if (client) {
            client.release();
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