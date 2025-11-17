const express = require('express');
const router = express.Router();
const avaliacaoController = require('../../controllers/contrato/AvaliacaoController.js');

router.get('/avaliacao', avaliacaoController.lerAvaliacoes);
router.get('/avaliacao/usuario/:idUsuario', avaliacaoController.buscarAvaliacoesPorUsuario);
router.get('/avaliacao/hospedagem/:idHospedagem', avaliacaoController.buscarAvaliacoesPorHospedagem);
router.get('/avaliacao/:idAvaliacao', avaliacaoController.buscarAvaliacaoPorId);
router.post('/avaliacao', avaliacaoController.criarAvaliacao);
router.put('/avaliacao/:idAvaliacao', avaliacaoController.atualizarAvaliacao);
router.delete('/avaliacao/:idAvaliacao', avaliacaoController.excluirAvaliacao);

module.exports = router;