const pool = require('../../connections/SQLConnections.js');
const bcrypt = require('bcrypt');

async function loginUsuario(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { email, senha } = req.body;

        // Validação dos campos
        if (!email || !senha) {
            return res.status(400).json({
                success: false,
                message: 'Email e senha são obrigatórios'
            });
        }

        // Buscar usuário
        const result = await client.query(
            'SELECT * FROM Usuario WHERE email = $1 AND desativado = false',
            [email.trim().toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Email ou senha incorretos'
            });
        }

        const usuario = result.rows[0];

        // Verificar conta ativada
        if (!usuario.ativado) {
            return res.status(403).json({
                success: false,
                message: 'Conta não ativada. Ative sua conta antes de fazer login.'
            });
        }

        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({
                success: false,
                message: 'Email ou senha incorretos'
            });
        }

        // Remover senha da resposta
        const { senha: _, ...usuarioSemSenha } = usuario;

        res.status(200).json({
            success: true,
            message: 'Login realizado com sucesso!',
            usuario: usuarioSemSenha
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno no servidor'
        });
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function alterarSenha(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { idUsuario } = req.params;
        const { senhaAtual, novaSenha } = req.body;

        // Validações
        if (!senhaAtual || !novaSenha) {
            return res.status(400).json({
                success: false,
                message: 'Senha atual e nova senha são obrigatórias'
            });
        }

        if (novaSenha.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A nova senha deve ter pelo menos 6 caracteres'
            });
        }

        // Buscar usuário
        const userResult = await client.query(
            'SELECT * FROM Usuario WHERE idUsuario = $1 AND desativado = false',
            [idUsuario]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Usuário não encontrado' 
            });
        }

        const usuario = userResult.rows[0];

        // Verificar senha atual
        const senhaAtualValida = await bcrypt.compare(senhaAtual, usuario.senha);
        if (!senhaAtualValida) {
            return res.status(401).json({
                success: false,
                message: 'Senha atual incorreta'
            });
        }

        // Hash da nova senha
        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

        // Atualizar senha
        const result = await client.query(
            'UPDATE Usuario SET senha = $1 WHERE idUsuario = $2 RETURNING idUsuario, nome, email',
            [novaSenhaHash, idUsuario]
        );

        res.status(200).json({
            success: true,
            message: 'Senha alterada com sucesso!',
            usuario: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao alterar senha'
        });
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function solicitarRecuperacaoSenha(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email é obrigatório'
            });
        }

        // Buscar usuário
        const result = await client.query(
            'SELECT * FROM Usuario WHERE email = $1 AND desativado = false AND ativado = true',
            [email.trim().toLowerCase()]
        );

        // Sempre retornar mesma mensagem por segurança
        const resposta = {
            success: true,
            message: 'Se o email existir em nosso sistema, enviaremos instruções de recuperação'
        };

        if (result.rows.length === 0) {
            return res.status(200).json(resposta);
        }

        const usuario = result.rows[0];

        // Gerar token simples (em produção, use crypto.randomBytes)
        const token = Math.random().toString(36).substring(2, 15) + 
                     Math.random().toString(36).substring(2, 15);

        // Marcar para recuperação
        await client.query(
            'UPDATE Usuario SET esqueceuSenha = true, token_recuperacao = $1 WHERE idUsuario = $2',
            [token, usuario.idusuario]
        );

        console.log(`📧 Token de recuperação para ${email}: ${token}`);

        res.status(200).json(resposta);

    } catch (error) {
        console.error('Erro na recuperação de senha:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao solicitar recuperação de senha'
        });
    } finally {
        if (client) {
            client.release();
        }
    }
}

async function redefinirSenha(req, res) {
    let client;

    try {
        client = await pool.connect();
        const { token, novaSenha } = req.body;

        // Validações
        if (!token || !novaSenha) {
            return res.status(400).json({
                success: false,
                message: 'Token e nova senha são obrigatórios'
            });
        }

        if (novaSenha.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha deve ter pelo menos 6 caracteres'
            });
        }

        // Buscar usuário pelo token
        const userResult = await client.query(
            'SELECT * FROM Usuario WHERE token_recuperacao = $1 AND esqueceuSenha = true',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Token inválido ou expirado'
            });
        }

        const usuario = userResult.rows[0];

        // Hash da nova senha
        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

        // Atualizar senha e limpar token
        await client.query(
            'UPDATE Usuario SET senha = $1, esqueceuSenha = false, token_recuperacao = NULL WHERE idUsuario = $2',
            [novaSenhaHash, usuario.idusuario]
        );

        res.status(200).json({
            success: true,
            message: 'Senha redefinida com sucesso!'
        });

    } catch (error) {
        console.error('Erro ao redefinir senha:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao redefinir senha'
        });
    } finally {
        if (client) {
            client.release();
        }
    }
}

module.exports = {
    loginUsuario,
    alterarSenha,
    solicitarRecuperacaoSenha,
    redefinirSenha
};