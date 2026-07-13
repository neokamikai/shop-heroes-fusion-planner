const { AssistantService } = require('../services/assistant.service');

function createAssistantService() {
  return new AssistantService();
}

module.exports = {
  createAssistantService
};
