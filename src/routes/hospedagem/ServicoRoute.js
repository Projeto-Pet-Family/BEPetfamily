const express = require('express');
const Router = express.Router();
const ServicoController = require('../../controllers/hospedagem/ServicoController.js');

Router.get('/hospedagens/:idHospedagem/servicos', ServicoController.listarServicosPorHospedagem);
Router.post('/hospedagens/:idHospedagem/servicos', ServicoController.adicionarServicoAHospedagem);

Router.put('/servicos/:idServico', ServicoController.atualizarServico);
Router.delete('/servicos/:idServico', ServicoController.removerServico);

module.exports = Router;