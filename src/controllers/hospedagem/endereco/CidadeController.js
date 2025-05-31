const sqlconnection = require('../../../connections/SQLConnections.js');

async function lerCidades(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        
        // Adiciona filtro por estado se fornecido
        const { estadoId } = req.query;
        let query = 'SELECT c.*, e.nome as estado, e.sigla FROM Cidade c JOIN Estado e ON c.idEstado = e.idEstado';
        const params = [];
        
        if (estadoId) {
            query += ' WHERE c.idEstado = ?';
            params.push(estadoId);
        }
        
        query += ' ORDER BY c.nome';
        
        const [result] = await sql.query(query, params);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar cidades',
            error: error.message
        });
        console.error('Erro ao listar cidades:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarCidadePorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idCidade } = req.params;
        
        const [result] = await sql.query(`
            SELECT c.*, e.nome as estado, e.sigla 
            FROM Cidade c 
            JOIN Estado e ON c.idEstado = e.idEstado 
            WHERE c.idCidade = ?
        `, [idCidade]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Cidade não encontrada' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar cidade',
            error: error.message
        });
        console.error('Erro ao buscar cidade:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarCidade(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

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
        const [estado] = await sql.query('SELECT 1 FROM Estado WHERE idEstado = ?', [idEstado]);
        if (estado.length === 0) {
            return res.status(400).json({
                message: 'Estado não encontrado'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO Cidade (nome, idEstado) VALUES (?, ?)',
            [nome, idEstado]
        );

        // Buscar os dados completos da cidade criada
        const [novaCidade] = await sql.query(`
            SELECT c.*, e.nome as estado, e.sigla 
            FROM Cidade c 
            JOIN Estado e ON c.idEstado = e.idEstado 
            WHERE c.idCidade = ?
        `, [result.insertId]);

        res.status(201).json({
            message: 'Cidade criada com sucesso',
            data: novaCidade[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (cidade já existe no estado)
        if (error.code === 'ER_DUP_ENTRY') {
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
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarCidade(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idCidade } = req.params;

        const {
            nome,
            idEstado
        } = req.body;

        // Verificar se a cidade existe
        const [cidade] = await sql.query('SELECT * FROM Cidade WHERE idCidade = ?', [idCidade]);
        if (cidade.length === 0) {
            return res.status(404).json({ message: 'Cidade não encontrada' });
        }

        // Verificar se o novo estado existe, se for fornecido
        if (idEstado) {
            const [estado] = await sql.query('SELECT 1 FROM Estado WHERE idEstado = ?', [idEstado]);
            if (estado.length === 0) {
                return res.status(400).json({
                    message: 'Estado não encontrado'
                });
            }
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (nome) updateFields.nome = nome;
        if (idEstado) updateFields.idEstado = idEstado;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Cidade SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idCidade = ?';
        values.push(idCidade);

        await sql.query(query, values);

        // Buscar a cidade atualizada
        const [updatedCidade] = await sql.query(`
            SELECT c.*, e.nome as estado, e.sigla 
            FROM Cidade c 
            JOIN Estado e ON c.idEstado = e.idEstado 
            WHERE c.idCidade = ?
        `, [idCidade]);

        res.status(200).json({
            message: 'Cidade atualizada com sucesso',
            data: updatedCidade[0]
        });

    } catch (error) {
        // Verificar se é erro de duplicação (cidade já existe no estado)
        if (error.code === 'ER_DUP_ENTRY') {
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
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirCidade(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idCidade } = req.params;

        // Verificar se a cidade existe
        const [cidade] = await sql.query(`
            SELECT c.*, e.nome as estado, e.sigla 
            FROM Cidade c 
            JOIN Estado e ON c.idEstado = e.idEstado 
            WHERE c.idCidade = ?
        `, [idCidade]);
        
        if (cidade.length === 0) {
            return res.status(404).json({ message: 'Cidade não encontrada' });
        }

        await sql.query('DELETE FROM Cidade WHERE idCidade = ?', [idCidade]);

        res.status(200).json({
            message: 'Cidade excluída com sucesso',
            data: cidade[0]
        });

    } catch (error) {
        // Verificar se o erro é devido a uma restrição de chave estrangeira
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
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
        if (sql) {
            await sql.end();
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