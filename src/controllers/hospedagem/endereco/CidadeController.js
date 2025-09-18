const pool = require('../../../connections/SQLConnections.js');

async function lerCidades(req, res) {
    let client;

    try {
        client = await pool.connect();
        
        // Adiciona filtro por estado se fornecido
        const { estadoId } = req.query;
        let query = 'SELECT c.*, e.nome as estado, e.sigla FROM cidade c JOIN estado e ON c.idestado = e.idestado';
        const params = [];
        
        if (estadoId) {
            query += ' WHERE c.id_estado = $1';
            params.push(estadoId);
        }
        
        query += ' ORDER BY c.nome';
        
        const result = await client.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar cidades',
            error: error.message
        });
        console.error('Erro ao listar cidades:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function buscarCidadePorId(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idCidade } = req.params;
        
        const result = await client.query(`
            SELECT c.*, e.nome as estado, e.sigla 
            FROM cidade c 
            JOIN estado e ON c.id_estado = e.id_estado 
            WHERE c.id_cidade = $1
        `, [idCidade]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Cidade não encontrada' });
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar cidade',
            error: error.message
        });
        console.error('Erro ao buscar cidade:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function criarCidade(req, res) {
    let client;

    try {
        client = await pool.connect();

        const { 
            nome,
            idEstado
        } = req.body;

        // Validar campos obrigatórios
        if (!nome || !idEstado) {
            return res.status(400).json({
                message: 'Nome e ID do estado são campos obrigatórios'
            });
        }

        // Verificar se o estado existe
        const estado = await client.query('SELECT 1 FROM estado WHERE id_estado = $1', [idEstado]);
        if (estado.rows.length === 0) {
            return res.status(400).json({
                message: 'Estado não encontrado'
            });
        }

        // Inserir no banco de dados
        const result = await client.query(
            'INSERT INTO cidade (nome, id_estado) VALUES ($1, $2) RETURNING *',
            [nome, idEstado]
        );

        // Buscar os dados completos da cidade criada
        const novaCidade = await client.query(`
            SELECT c.*, e.nome as estado, e.sigla 
            FROM cidade c 
            JOIN estado e ON c.id_estado = e.id_estado 
            WHERE c.id_cidade = $1
        `, [result.rows[0].id_cidade]);

        res.status(201).json({
            message: 'Cidade criada com sucesso',
            data: novaCidade.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (cidade já existe no estado)
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe uma cidade com este nome no estado selecionado'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar cidade',
            error: error.message
        });
        console.error('Erro ao criar cidade:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function atualizarCidade(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idCidade } = req.params;

        const {
            nome,
            idEstado
        } = req.body;

        // Verificar se a cidade existe
        const cidade = await client.query('SELECT * FROM cidade WHERE id_cidade = $1', [idCidade]);
        if (cidade.rows.length === 0) {
            return res.status(404).json({ message: 'Cidade não encontrada' });
        }

        // Verificar se o novo estado existe, se for fornecido
        if (idEstado) {
            const estado = await client.query('SELECT 1 FROM estado WHERE id_estado = $1', [idEstado]);
            if (estado.rows.length === 0) {
                return res.status(400).json({
                    message: 'Estado não encontrado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (nome) updateFields.nome = nome;
        if (idEstado) updateFields.id_estado = idEstado;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE cidade SET ';
        const setClauses = [];
        const values = [];
        let paramCount = 1;
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = $${paramCount}`);
            values.push(value);
            paramCount++;
        }
        
        query += setClauses.join(', ');
        query += ` WHERE id_cidade = $${paramCount}`;
        values.push(idCidade);

        await client.query(query, values);

        // Buscar a cidade atualizada
        const updatedCidade = await client.query(`
            SELECT c.*, e.nome as estado, e.sigla 
            FROM cidade c 
            JOIN estado e ON c.id_estado = e.id_estado 
            WHERE c.id_cidade = $1
        `, [idCidade]);

        res.status(200).json({
            message: 'Cidade atualizada com sucesso',
            data: updatedCidade.rows[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (cidade já existe no estado)
        if (error.code === '23505') {
            return res.status(409).json({
                message: 'Já existe uma cidade com este nome no estado selecionado'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar cidade',
            error: error.message
        });
        console.error('Erro ao atualizar cidade:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

async function excluirCidade(req, res) {
    let client;
    
    try {
        client = await pool.connect();
        const { idCidade } = req.params;

        // Verificar se a cidade existe
        const cidade = await client.query(`
            SELECT c.*, e.nome as estado, e.sigla 
            FROM cidade c 
            JOIN estado e ON c.id_estado = e.id_estado 
            WHERE c.id_cidade = $1
        `, [idCidade]);
        
        if (cidade.rows.length === 0) {
            return res.status(404).json({ message: 'Cidade não encontrada' });
        }

        await client.query('DELETE FROM cidade WHERE id_cidade = $1', [idCidade]);

        res.status(200).json({
            message: 'Cidade excluída com sucesso',
            data: cidade.rows[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === '23503') {
            return res.status(400).json({
                message: 'Não é possível excluir a cidade pois está sendo utilizada em bairros'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir cidade',
            error: error.message
        });
        console.error('Erro ao excluir cidade:', error);
    } finally {
        if (client) {
            await client.end();
        }
    }
}

module.exports = {
    lerCidades,
    buscarCidadePorId,
    criarCidade,
    atualizarCidade,
    excluirCidade
};