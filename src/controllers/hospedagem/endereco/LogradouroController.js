const pool = require('../../../connections/SQLConnections.js');

async function lerLogradouros(req, res) {
    let client;

    try {
        client = await pool.connect();
        
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
            query += ' WHERE l."idBairro" = $1';
            params.push(bairroId);
        }
        
        query += ' ORDER BY l.nome';
        
        const result = await client.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar logradouros',
            error: error.message
        });
        console.error('Erro ao listar logradouros:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarLogradouroPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idLogradouro } = req.params;
        
        const result = await client.query(`
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l."idBairro" = b."idBairro"
            JOIN Cidade c ON b."idCidade" = c."idCidade"
            JOIN Estado e ON c."idEstado" = e."idEstado"
            WHERE l."idLogradouro" = $1
        `, [idLogradouro]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Logradouro não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar logradouro',
            error: error.message
        });
        console.error('Erro ao buscar logradouro:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function criarLogradouro(req, res) {
    let client;

    try {
        client = await pool.connect();

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
        const bairro = await client.query('SELECT 1 FROM Bairro WHERE "idBairro" = $1', [idBairro]);
        if (bairro.rows.length === 0) {
            return res.status(400).json({
                message: 'Bairro não encontrado'
            });
        }

        // Inserir no banco de dados
        const result = await client.query(
            'INSERT INTO Logradouro (nome, "idBairro") VALUES ($1, $2) RETURNING "idLogradouro"',
            [nome, idBairro]
        );

        // Buscar os dados completos do logradouro criado
        const novoLogradouro = await client.query(`
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l."idBairro" = b."idBairro"
            JOIN Cidade c ON b."idCidade" = c."idCidade"
            JOIN Estado e ON c."idEstado" = e."idEstado"
            WHERE l."idLogradouro" = $1
        `, [result.rows[0].idLogradouro]);

        res.status(201).json({
            message: 'Logradouro criado com sucesso',
            data: novoLogradouro.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (logradouro já existe no bairro)
        if (error.code === '23505') { // Código de violação de constraint única no PostgreSQL
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
        if (client) {
            await client.end();
        }
    }
}

async function atualizarLogradouro(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idLogradouro } = req.params;

        const {
            nome,
            idBairro
        } = req.body;

        // Verificar se o logradouro existe
        const logradouro = await client.query('SELECT * FROM Logradouro WHERE "idLogradouro" = $1', [idLogradouro]);
        if (logradouro.rows.length === 0) {
            return res.status(404).json({ message: 'Logradouro não encontrado' });
        }

        // Verificar se o novo bairro existe, se for fornecido
        if (idBairro) {
            const bairro = await client.query('SELECT 1 FROM Bairro WHERE "idBairro" = $1', [idBairro]);
            if (bairro.rows.length === 0) {
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
        let paramCount = 1;
        
        for (const [key, value] of Object.entries(updateFields)) {
            const columnName = key === 'idBairro' ? '"idBairro"' : key;
            setClauses.push(`${columnName} = $${paramCount}`);
            values.push(value);
            paramCount++;
        }
        
        query += setClauses.join(', ');
        query += ` WHERE "idLogradouro" = $${paramCount}`;
        values.push(idLogradouro);

        await client.query(query, values);

        // Buscar o logradouro atualizado
        const updatedLogradouro = await client.query(`
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l."idBairro" = b."idBairro"
            JOIN Cidade c ON b."idCidade" = c."idCidade"
            JOIN Estado e ON c."idEstado" = e."idEstado"
            WHERE l."idLogradouro" = $1
        `, [idLogradouro]);

        res.status(200).json({
            message: 'Logradouro atualizado com sucesso',
            data: updatedLogradouro.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (logradouro já existe no bairro)
        if (error.code === '23505') { // Código de violação de constraint única no PostgreSQL
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
        if (client) {
            await client.end();
        }
    }
}

async function excluirLogradouro(req, res) {
    let client;
    
    try {
        client = await pool.connect();
        const { idLogradouro } = req.params;

        // Verificar se o logradouro existe
        const logradouro = await client.query(`
            SELECT l.*, b.nome as bairro, c.nome as cidade, e.nome as estado, e.sigla 
            FROM Logradouro l 
            JOIN Bairro b ON l."idBairro" = b."idBairro"
            JOIN Cidade c ON b."idCidade" = c."idCidade"
            JOIN Estado e ON c."idEstado" = e."idEstado"
            WHERE l."idLogradouro" = $1
        `, [idLogradouro]);
        
        if (logradouro.rows.length === 0) {
            return res.status(404).json({ message: 'Logradouro não encontrado' });
        }

        await client.query('DELETE FROM Logradouro WHERE "idLogradouro" = $1', [idLogradouro]);

        res.status(200).json({
            message: 'Logradouro excluído com sucesso',
            data: logradouro.rows[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === '23503') { // Código de violação de chave estrangeira no PostgreSQL
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
        if (client) {
            await client.end();
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