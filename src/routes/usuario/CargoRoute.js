const express = require('express');
const Router = express.Router();
const CargoController = require('../../controllers/CargoController');

// Rotas para CRUD de Cargos
Router.get('/cargos', CargoController.listarCargos);
Router.get('/cargos/:idCargo', CargoController.buscarCargoPorId);
Router.post('/cargos', CargoController.criarCargo);
Router.put('/cargos/:idCargo', CargoController.atualizarCargo);
Router.delete('/cargos/:idCargo', CargoController.excluirCargo);

module.exports = Router;