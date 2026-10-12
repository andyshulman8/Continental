/**
 * MultiplayerMessageManager - mirrors the web MultiplayerSession message API
 * Handles quick message sending and receiving in local/networked multiplayer
 * Can be extended to sync with web backend or Game Center
 */

import Foundation

struct GameMessage: Codable {
  let fromId: String
  let fromName: String
  let text: String
  let timestamp: TimeInterval
}

class MultiplayerMessageManager {
  let gameId: String
  let playerId: String
  let playerName: String
  
  private var messages: [GameMessage] = []
  private var callbacks: [(String, [GameMessage]) -> Void] = []
  private let storagePrefix: String
  
  init(gameId: String, playerId: String, playerName: String) {
    self.gameId = gameId
    self.playerId = playerId
    self.playerName = playerName
    self.storagePrefix = "game_messages_\(gameId)"
    
    // Load existing messages from storage
    loadMessagesFromStorage()
  }
  
  /**
   * Send a quick message to the session
   */
  func sendMessage(_ text: String) -> GameMessage {
    let message = GameMessage(
      fromId: playerId,
      fromName: playerName,
      text: text,
      timestamp: Date().timeIntervalSince1970
    )
    
    messages.append(message)
    saveMessagesToStorage()
    notifyListeners(message)
    
    return message
  }
  
  /**
   * Register a callback to receive message updates
   */
  func onMessageReceived(_ callback: @escaping (GameMessage) -> Void) {
    // Create a wrapper that calls the callback on main thread
    callbacks.append { event, msgArray in
      if event == "message_received", let lastMsg = msgArray.last {
        DispatchQueue.main.async {
          callback(lastMsg)
        }
      }
    }
  }
  
  /**
   * Get all messages for this game session
   */
  func getMessages() -> [GameMessage] {
    return messages
  }
  
  /**
   * Get messages since a given timestamp
   */
  func getNewMessages(since timestamp: TimeInterval) -> [GameMessage] {
    return messages.filter { $0.timestamp > timestamp }
  }
  
  /**
   * Clear messages (e.g., when hand ends)
   */
  func clearMessages() {
    messages.removeAll()
    saveMessagesToStorage()
  }
  
  // MARK: - Private Storage
  
  private func saveMessagesToStorage() {
    let defaults = UserDefaults.standard
    if let encoded = try? JSONEncoder().encode(messages) {
      defaults.set(encoded, forKey: storagePrefix)
    }
  }
  
  private func loadMessagesFromStorage() {
    let defaults = UserDefaults.standard
    if let data = defaults.data(forKey: storagePrefix) {
      if let decoded = try? JSONDecoder().decode([GameMessage].self, from: data) {
        messages = decoded
      }
    }
  }
  
  private func notifyListeners(_ message: GameMessage) {
    callbacks.forEach { callback in
      callback("message_received", [message])
    }
  }
  
  /**
   * Extension point: override this to sync with a backend API
   * Example: POST message to server and sync other players' messages
   */
  func syncWithBackend() {
    // TODO: Implement network sync with backend session manager
    // This would allow messages to sync across devices via a server
  }
}
