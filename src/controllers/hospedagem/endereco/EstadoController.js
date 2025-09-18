const pool = require('../../../connections/SQLConnections.js');

// Listar todos os estados com possibilidade de filtro por sigla
async function lerEstados(req, res) {
    let client;

    try {
        client = await pool.connect();
        
        const { sigla, nome } = req.query;
        let query = `SELECT * FROM estado`;
        const params = [];
        let whereClauses = [];
        let paramCount = 1;
        
        if (sigla) {
            whereClauses.push(`sigla = $${paramCount}`);
            params.push(sigla.toUpperCase());
            paramCount++;
        }
        
        if (nome) {
            whereClauses.push(`nome ILIKE $${paramCount}`);
            params.push(`%${nome}%`);
            paramCount++;
        }
        
        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }
        
        query += ' ORDER BY nome';
        
        const result = await client.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar estados',
            error: error.message
        });
        console.error('Erro ao listar estados:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Buscar estado por ID
async function buscarEstadoPorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idEstado } = req.params;
        
        const result = await client.query(
            'SELECT * FROM Estado WHERE "idEstado" = $1', 
            [idEstado]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar estado',
            error: error.message
        });
        console.error('Erro ao buscar estado:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Buscar estado por sigla
async function buscarEstadoPorSigla(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { sigla } = req.params;
        
        const result = await client.query(
            'SELECT * FROM Estado WHERE sigla = $1', 
            [sigla.toUpperCase()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar estado por sigla',
            error: error.message
        });
        console.error('Erro ao buscar estado por sigla:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Criar novo estado
async function criarEstado(req, res) {
    let client;

    try {
        client = await pool.connect();

        const { nome, sigla } = req.body;

        // Validações
        if (!nome || !sigla) {
            return res.status(400).json({
                message: 'Nome e sigla são campos obrigatórios'
            });
        }

        if (sigla.length !== 2 || !/^[A-Za-z]{2}$/.test(sigla)) {
            return res.status(400).json({
                message: 'A sigla deve ter exatamente 2 letras'
            });
        }

        if (nome.length < 3 || nome.length > 30) {
            return res.status(400).json({
                message: 'O nome do estado deve ter entre 3 e 30 caracteres'
            });
        }

        // Inserir no banco
        const result = await client.query(
            'INSERT INTO Estado (nome, sigla) VALUES ($1, $2) RETURNING *',
            [nome, sigla.toUpperCase()]
        );

        res.status(201).json({
            message: 'Estado criado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') { // Violação de constraint única
            if (error.constraint && error.constraint.includes('sigla')) {
                return res.status(409).json({ message: 'Já existe um estado com esta sigla' });
            } else if (error.constraint && error.constraint.includes('nome')) {
                return res.status(409).json({ message: 'Já existe um estado com este nome' });
            }
            return res.status(409).json({ message: 'Estado já existe' });
        }
        
        res.status(500).json({
            message: 'Erro ao criar estado',
            error: error.message
        });
        console.error('Erro ao criar estado:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Atualizar estado existente
async function atualizarEstado(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idEstado } = req.params;
        const { nome, sigla } = req.body;

        // Verificar se o estado existe
        const estado = await client.query(
            'SELECT * FROM Estado WHERE "idEstado" = $1', 
            [idEstado]
        );
        if (estado.rows.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        // Validações
        const updateFields = [];
        const values = [];
        let paramCount = 1;

        if (nome !== undefined) {
            if (nome.length < 3 || nome.length > 30) {
                return res.status(400).json({
                    message: 'O nome do estado deve ter entre 3 e 30 caracteres'
                });
            }
            updateFields.push(`nome = $${paramCount}`);
            values.push(nome);
            paramCount++;
        }

        if (sigla !== undefined) {
            if (sigla.length !== 2 || !/^[A-Za-z]{2}$/.test(sigla)) {
                return res.status(400).json({
                    message: 'A sigla deve ter exatamente 2 letras'
                });
            }
            updateFields.push(`sigla = $${paramCount}`);
            values.push(sigla.toUpperCase());
            paramCount++;
        }

        if (updateFields.length === 0) {
            return res.status(400).json({ 
                message: 'Nenhum campo válido para atualização fornecido' 
            });
        }

        values.push(idEstado);
        const query = `UPDATE Estado SET ${updateFields.join(', ')} WHERE "idEstado" = $${paramCount} RETURNING *`;

        // Atualizar no banco
        const result = await client.query(query, values);

        res.status(200).json({
            message: 'Estado atualizado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') { // Violação de constraint única
            if (error.constraint && error.constraint.includes('sigla')) {
                return res.status(409).json({ message: 'Já existe um estado com esta sigla' });
            } else if (error.constraint && error.constraint.includes('nome')) {
                return res.status(409).json({ message: 'Já existe um estado com este nome' });
            }
            return res.status(409).json({ message: 'Estado já existe' });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar estado',
            error: error.message
        });
        console.error('Erro ao atualizar estado:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

// Excluir estado
async function excluirEstado(req, res) {
    let client;
    
    try {
        client = await pool.connect();
        const { idEstado } = req.params;

        // Verificar se o estado existe
        const estado = await client.query(
            'SELECT * FROM Estado WHERE "idEstado" = $1', 
            [idEstado]
        );
        
        if (estado.rows.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        // Verificar se há cidades associadas
        const cidades = await client.query(
            'SELECT 1 FROM Cidade WHERE "idEstado" = $1 LIMIT 1',
            [idEstado]
        );
        
        if (cidades.rows.length > 0) {
            return res.status(400).json({
                message: 'Não é possível excluir o estado pois existem cidades vinculadas a ele'
            });
        }

        await client.query('DELETE FROM Estado WHERE "idEstado" = $1', [idEstado]);

        res.status(200).json({
            message: 'Estado excluído com sucesso',
            data: estado.rows[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir estado',
            error: error.message
        });
        console.error('Erro ao excluir estado:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    lerEstados,
    buscarEstadoPorId,
    buscarEstadoPorSigla,
    criarEstado,
    atualizarEstado,
    excluirEstado
};