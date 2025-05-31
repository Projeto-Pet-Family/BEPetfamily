const express = require('express');
const Router = express.Router();
const ServicoController = require('../../controllers/hospedagem/ServicoController.js');

// Rotas específicas para serviços de uma hospedagem
Router.get('/hospedagens/:idHospedagem/servicos', ServicoController.listarServicosPorHospedagem);
Router.post('/hospedagens/:idHospedagem/servicos', ServicoController.adicionarServicoAHospedagem);

// Rotas para operações gerais de serviços
Router.put('/servicos/:idServico', ServicoController.atualizarServico);
Router.delete('/servicos/:idServico', ServicoController.removerServico);

module.exports = Router;