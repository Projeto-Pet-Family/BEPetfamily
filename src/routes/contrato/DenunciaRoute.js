const express = require('express');
const router = express.Router();
const denunciaController = require('../../controllers/contrato/DenunciaController.js');

router.get('/denuncia', denunciaController.lerDenuncias);
router.get('/denuncia/usuario/:idUsuario', denunciaController.buscarDenunciasPorUsuario);
router.get('/denuncia/hospedagem/:idHospedagem', denunciaController.buscarDenunciasPorHospedagem);
router.get('/denuncia/:idDenuncia', denunciaController.buscarDenunciaPorId);
router.post('/denuncia', denunciaController.criarDenuncia);
router.put('/denuncia/:idDenuncia', denunciaController.atualizarDenuncia);
router.delete('/denuncia/:idDenuncia', denunciaController.excluirDenuncia);

module.exports = router;