const express = require('express');
const router = express.Router();
const AutenticationController = require('../../controllers/usuario/AutenticationController.js');

router.post('/login', AutenticationController.loginUsuario);
router.put('/usuarios/:idUsuario/alterar-senha', AutenticationController.alterarSenha);
router.post('/recuperar-senha', AutenticationController.solicitarRecuperacaoSenha);
router.post('/redefinir-senha', AutenticationController.redefinirSenha);

module.exports = router;