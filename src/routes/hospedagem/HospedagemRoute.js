const express = require('express')
const Router = express.Router()
const HospedagemController = require('../../controllers/hospedagem/HospedagemController.js')

// Rotas CRUD para hospedagens
Router.get('/hospedagens', HospedagemController.lerHospedagens);
Router.get('/hospedagens/:idHospedagem', HospedagemController.buscarHospedagemPorId);
Router.post('/hospedagens', HospedagemController.criarHospedagem);
Router.put('/hospedagens/:idHospedagem', HospedagemController.atualizarHospedagem);
Router.delete('/hospedagens/:idHospedagem', HospedagemController.excluirHospedagem);

// Rotas de autenticação
Router.post('/hospedagens/login', HospedagemController.loginHospedagem);
Router.put('/hospedagens/:idHospedagem/senha', HospedagemController.alterarSenha);

module.exports = Router