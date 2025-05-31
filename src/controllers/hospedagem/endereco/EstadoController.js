const sqlconnection = require('../../../connections/SQLConnections.js');

async function lerEstados(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const [result] = await sql.query('SELECT * FROM Estado ORDER BY nome');
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar estados',
            error: error.message
        });
        console.error('Erro ao listar estados:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarEstadoPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idEstado } = req.params;
        const [result] = await sql.query('SELECT * FROM Estado WHERE idEstado = ?', [idEstado]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar estado',
            error: error.message
        });
        console.error('Erro ao buscar estado:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarEstado(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            nome,
            sigla
        } = req.body;

        // Validar campos obrigatórios
        if (!nome || !sigla) {
            return res.status(400).json({
                message: 'Nome e sigla são campos obrigatórios'
            });
        }

        // Validar sigla (2 caracteres)
        if (sigla.length !== 2) {
            return res.status(400).json({
                message: 'Sigla deve ter exatamente 2 caracteres'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO Estado (nome, sigla) VALUES (?, ?)',
            [nome, sigla.toUpperCase()]
        );

        const novoEstado = {
            idEstado: result.insertId,
            nome,
            sigla: sigla.toUpperCase()
        };

        res.status(201).json({
            message: 'Estado criado com sucesso',
            data: novoEstado
        });

    } catch (error) {
        // Verificar se é erro de duplicação (sigla ou nome já existem)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um estado com este nome ou sigla'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao criar estado',
            error: error.message
        });
        console.error('Erro ao criar estado:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarEstado(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idEstado } = req.params;

        const {
            nome,
            sigla
        } = req.body;

        // Verificar se o estado existe
        const [estado] = await sql.query('SELECT * FROM Estado WHERE idEstado = ?', [idEstado]);
        if (estado.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        // Validar sigla se for fornecida
        if (sigla && sigla.length !== 2) {
            return res.status(400).json({
                message: 'Sigla deve ter exatamente 2 caracteres'
            });
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (nome) updateFields.nome = nome;
        if (sigla) updateFields.sigla = sigla.toUpperCase();

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Estado SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idEstado = ?';
        values.push(idEstado);

        await sql.query(query, values);

        // Buscar o estado atualizado
        const [updatedEstado] = await sql.query('SELECT * FROM Estado WHERE idEstado = ?', [idEstado]);

        res.status(200).json({
            message: 'Estado atualizado com sucesso',
            data: updatedEstado[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (sigla ou nome já existem)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Já existe um estado com este nome ou sigla'
            });
        }
        
        res.status(500).json({
            message: 'Erro ao atualizar estado',
            error: error.message
        });
        console.error('Erro ao atualizar estado:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirEstado(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idEstado } = req.params;

        // Verificar se o estado existe
        const [estado] = await sql.query('SELECT * FROM Estado WHERE idEstado = ?', [idEstado]);
        if (estado.length === 0) {
            return res.status(404).json({ message: 'Estado não encontrado' });
        }

        await sql.query('DELETE FROM Estado WHERE idEstado = ?', [idEstado]);

        res.status(200).json({
            message: 'Estado excluído com sucesso',
            data: estado[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                message: 'Não é possível excluir o estado pois está sendo utilizado em cidades'
            });
        }

        res.status(500).json({
            message: 'Erro ao excluir estado',
            error: error.message
        });
        console.error('Erro ao excluir estado:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerEstados,
    buscarEstadoPorId,
    criarEstado,
    atualizarEstado,
    excluirEstado
};