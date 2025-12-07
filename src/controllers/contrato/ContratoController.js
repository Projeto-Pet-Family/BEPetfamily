// controllers/contrato/ContratoController.js (ou index.js)
const OperacoesCRUDContratoController = require('./core/OperacoesCRUDContratoController.js');
const OperacoesStatusContratoController = require('./core/OperacoesStatusContratoController.js');
const OperacoesCalculoContratoController = require('./core/OperacoesCalculosContratoController.js');
const OperacoesPetContratoController = require('./relacionamentos/OperacoesPetContratoController.js');
const OperacoesServicoContratoController = require('./relacionamentos/OperacoesServicosContratoController.js');
const OperacoesDataContratoController = require('./relacionamentos/OperacoesDataContratoController.js');
const OperacoesUsuarioContratoController = require('./OperacoesUsuarioContratoController.js');

// Re-exportar todas as funções
module.exports = {
    // Operações CRUD
    ...OperacoesCRUDContratoController,
    
    // Operações de Status
    ...OperacoesStatusContratoController,
    
    // Operações de Cálculo
    ...OperacoesCalculoContratoController,
    
    // Operações com Pets
    ...OperacoesPetContratoController,
    
    // Operações com Serviços
    ...OperacoesServicoContratoController,
    
    // Operações com Datas
    ...OperacoesDataContratoController,
    
    // Operações por Usuário
    ...OperacoesUsuarioContratoController
};