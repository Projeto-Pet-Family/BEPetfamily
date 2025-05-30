const sqlconnection = require('../../connections/SQLConnections.js');

async function lerHospedagens(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const [result] = await sql.query('SELECT * FROM Hospedagem');
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao listar hospedagens',
            error: error.message
        });
        console.error('Erro ao listar hospedagens:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function buscarHospedagemPorId(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idHospedagem } = req.params;
        const [result] = await sql.query('SELECT * FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);

        if (result.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        res.status(200).json(result[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Erro ao buscar hospedagem',
            error: error.message
        });
        console.error('Erro ao buscar hospedagem:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function criarHospedagem(req, res) {
    let sql;

    try {
        sql = await sqlconnection();

        const { 
            nome,
            rua,
            numero,
            bairro,
            cidade,
            estado,
            CEP
        } = req.body;

        // Validar campos obrigatórios
        if (!nome || !rua || !numero || !bairro || !cidade || !estado || !CEP) {
            return res.status(400).json({
                message: 'Todos os campos são obrigatórios'
            });
        }

        // Validar formato do CEP (exemplo simples)
        if (!/^\d{5}-?\d{3}$/.test(CEP)) {
            return res.status(400).json({
                message: 'CEP inválido. Formato esperado: 00000-000 ou 00000000'
            });
        }

        // Inserir no banco de dados
        const [result] = await sql.query(
            'INSERT INTO Hospedagem (nome, rua, numero, bairro, cidade, estado, CEP) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nome, rua, numero, bairro, cidade, estado, CEP]
        );

        const novaHospedagem = {
            idHospedagem: result.insertId,
            nome,
            rua,
            numero,
            bairro,
            cidade,
            estado,
            CEP
        };

        res.status(201).json({
            message: 'Hospedagem criada com sucesso',
            data: novaHospedagem
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao criar hospedagem',
            error: error.message
        });
        console.error('Erro ao criar hospedagem:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function atualizarHospedagem(req, res) {
    let sql;

    try {
        sql = await sqlconnection();
        const { idHospedagem } = req.params;

        const {
            nome,
            rua,
            numero,
            bairro,
            cidade,
            estado,
            CEP
        } = req.body;

        // Verificar se a hospedagem existe
        const [hospedagem] = await sql.query('SELECT * FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);
        if (hospedagem.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        // Validar CEP se for fornecido
        if (CEP && !/^\d{5}-?\d{3}$/.test(CEP)) {
            return res.status(400).json({
                message: 'CEP inválido. Formato esperado: 00000-000 ou 00000000'
            });
        }

        // Construir a query dinamicamente
        const updateFields = {};
        if (nome) updateFields.nome = nome;
        if (rua) updateFields.rua = rua;
        if (numero) updateFields.numero = numero;
        if (bairro) updateFields.bairro = bairro;
        if (cidade) updateFields.cidade = cidade;
        if (estado) updateFields.estado = estado;
        if (CEP) updateFields.CEP = CEP;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ message: 'Nenhum campo válido para atualização fornecido' });
        }

        let query = 'UPDATE Hospedagem SET ';
        const setClauses = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updateFields)) {
            setClauses.push(`${key} = ?`);
            values.push(value);
        }
        
        query += setClauses.join(', ');
        query += ' WHERE idHospedagem = ?';
        values.push(idHospedagem);

        await sql.query(query, values);

        // Buscar a hospedagem atualizada
        const [updatedHospedagem] = await sql.query('SELECT * FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);

        res.status(200).json({
            message: 'Hospedagem atualizada com sucesso',
            data: updatedHospedagem[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao atualizar hospedagem',
            error: error.message
        });
        console.error('Erro ao atualizar hospedagem:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

async function excluirHospedagem(req, res) {
    let sql;
    
    try {
        sql = await sqlconnection();
        const { idHospedagem } = req.params;

        // Verificar se a hospedagem existe
        const [hospedagem] = await sql.query('SELECT * FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);
        if (hospedagem.length === 0) {
            return res.status(404).json({ message: 'Hospedagem não encontrada' });
        }

        await sql.query('DELETE FROM Hospedagem WHERE idHospedagem = ?', [idHospedagem]);

        res.status(200).json({
            message: 'Hospedagem excluída com sucesso',
            data: hospedagem[0]
        });

    } catch (error) {
        res.status(500).json({
            message: 'Erro ao excluir hospedagem',
            error: error.message
        });
        console.error('Erro ao excluir hospedagem:', error);
    } finally {
        if (sql) {
            await sql.end();
        }
    }
}

module.exports = {
    lerHospedagens,
    buscarHospedagemPorId,
    criarHospedagem,
    atualizarHospedagem,
    excluirHospedagem
};