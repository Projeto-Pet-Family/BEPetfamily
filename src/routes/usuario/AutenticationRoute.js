const express = require('express');
const router = express.Router();
const AutenticationController = require('../../controllers/usuario/AutenticationController.js');

router.post('/login', AutenticationController.loginUsuario);
router.post('/solicitar-recuperacao-senha', AutenticationController.solicitarRecuperacaoSenha);
router.post('/redefinir-senha', AutenticationController.redefinirSenha);
router.put('/usuarios/:idUsuario/alterar-senha', AutenticationController.alterarSenha);

module.exports = router;