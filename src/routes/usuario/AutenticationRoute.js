const express = require('express');
const router = express.Router();
const AutenticationController = require('../../controllers/usuario/AutenticationController.js');

router.get('/emails', AutenticationController.listarTodosEmails);
router.post('/verificar-email', AutenticationController.verificarEmail);
router.post('/redefinir-senha', AutenticationController.redefinirSenha);
router.post('/login', AutenticationController.loginUsuario);
router.put('/usuarios/:idUsuario/alterar-senha', AutenticationController.alterarSenha);

module.exports = router;