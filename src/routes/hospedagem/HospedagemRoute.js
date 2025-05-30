const express = require('express')
const Router = express.Router()
const HospedagemController = require('../../controllers/hospedagem/HospedagemController.js')

Router.get('/hospedagens', HospedagemController.lerHospedagens);
Router.get('/hospedagens/:idHospedagem', HospedagemController.buscarHospedagemPorId);
Router.post('/hospedagens', HospedagemController.criarHospedagem);
Router.put('/hospedagens/:idHospedagem', HospedagemController.atualizarHospedagem);
Router.delete('/hospedagens/:idHospedagem', HospedagemController.excluirHospedagem);

module.exports = Router