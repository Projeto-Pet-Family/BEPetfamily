const express = require('express');
const Router = express.Router();
const EstadoController = require('../../../controllers/hospedagem/endereco/EstadoController.js');

// Rotas para CRUD de Estados
Router.get('/estados', EstadoController.lerEstados);
Router.get('/estados/:idEstado', EstadoController.buscarEstadoPorId);
Router.get('/estados/sigla/:sigla', EstadoController.buscarEstadoPorSigla);
Router.post('/estados', EstadoController.criarEstado);
Router.put('/estados/:idEstado', EstadoController.atualizarEstado);
Router.delete('/estados/:idEstado', EstadoController.excluirEstado);

module.exports = Router;