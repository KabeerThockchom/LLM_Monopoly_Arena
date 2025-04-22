// LLM Player Implementation for Monopoly
// This file manages the interaction between the LLM and the game

// LLM Player constructor
function LLMPlayer(p) {
    this.apiKey = null; // Will need to be set by user
    this.isProcessing = false; // Flag to prevent multiple API calls
    this.alertList = ""; // Required by the game engine
    this.actionQueue = []; // Queue for planned actions
    this.lastState = null; // Last game state - useful for debugging
  
    // Initialize player
    p.name = "OpenAI (LLM)";
    p.isLLM = true;
    p.human = false;
  
    // Connect to OpenAI API
    this.setupOpenAI = function(apiKey) {
      this.apiKey = apiKey;
      this.openai = new OpenAI(apiKey);
      return this.testConnection();
    };
  
    // Test the API connection
    this.testConnection = function() {
      return new Promise((resolve, reject) => {
        if (!this.apiKey) {
          reject(new Error("API key not set"));
          return;
        }
  
        // Simple test call
        this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: [{role: "user", content: "Respond with 'Connection successful' if you can read this."}],
          max_tokens: 20
        }).then(response => {
          if (response.choices && response.choices.length > 0) {
            resolve(true);
          } else {
            reject(new Error("API response invalid"));
          }
        }).catch(error => {
          reject(error);
        });
      });
    };
  
    // Build context for LLM with game state and rules
    this.buildContext = function() {
      const gameState = llmTools.getGameState();
      this.lastState = gameState; // Store for debugging
      const p = gameState.currentPlayer; // Use currentPlayer from gameState
      
      // --- Format Current Player's Properties ---
      let propertiesText = "# Your Properties:\n";
      let ownedCount = 0;
      const groupOrder = [3, 4, 5, 6, 7, 8, 9, 10, 1, 2]; // Color groups, then RR, then Util

      groupOrder.forEach(groupNum => {
          if (p.propertiesByGroup[groupNum] && p.propertiesByGroup[groupNum].length > 0) {
              const groupName = getGroupName(groupNum);
              const isBuildable = p.buildableMonopolies.includes(groupNum);
              propertiesText += `## ${groupName} Group (${isBuildable ? 'BUILDABLE MONOPOLY' : p.propertiesByGroup[groupNum].length + ' owned'}):\n`;
              p.propertiesByGroup[groupNum].forEach(prop => {
                  const houseText = prop.houses > 0 ? 
                      `(${prop.houses} house${prop.houses !== 1 ? 's' : ''})` : 
                      prop.hotel ? '(HOTEL)' : '';
                  propertiesText += `- ${prop.name} ${houseText}\n`;
                  ownedCount++;
              });
          }
      });

      if (ownedCount === 0 && p.mortgagedProperties.length === 0) {
          propertiesText += "You don't own any properties yet.\n";
      }
      propertiesText += "\n";

      // Format mortgaged properties
      if (p.mortgagedProperties.length > 0) {
        propertiesText += "# Your Mortgaged Properties:\n";
        p.mortgagedProperties.forEach(prop => {
          propertiesText += `- ${prop.name} (${getGroupName(prop.groupNumber)}) - Unmortgage cost: $${prop.unmortgageValue}\n`;
        });
        propertiesText += "\n";
      }

      // --- Format Other Players' Info ---
      let playersText = "# Other Players:\n";
      gameState.playerDetails.forEach(otherP => {
        if (otherP.index !== p.index) {
          playersText += `## ${otherP.name} ($${otherP.money}):\n`;
          playersText += `- Position: ${otherP.positionName}\n`; // Use position name
          // Summarize properties
          let otherPropSummary = [];
          for (const groupNum in otherP.propertiesByGroup) {
              if (otherP.propertiesByGroup[groupNum].length > 0) {
                  otherPropSummary.push(`${otherP.propertiesByGroup[groupNum].length} ${getGroupName(groupNum)}`);
              }
          }
          if (otherP.mortgagedProperties.length > 0) {
              otherPropSummary.push(`${otherP.mortgagedProperties.length} Mortgaged`);
          }
          playersText += `- Properties: ${otherPropSummary.length > 0 ? otherPropSummary.join(', ') : 'None'}\n`;
          playersText += `- Total asset value: ~$${otherP.totalAssetValue}\n`;
        }
      });

      // --- Format Monopolies Info ---
      let monopoliesText = "# Monopolies on the Board:\n";
      if (gameState.monopolies.length === 0) {
        monopoliesText += "No player has a monopoly yet.\n";
      } else {
        gameState.monopolies.forEach(monopoly => {
          const groupName = getGroupName(monopoly.groupNumber);
          const ownerStatus = monopoly.owner === p.index ? '(Owned by You)' : `(Owned by ${monopoly.ownerName})`;
          monopoliesText += `- ${groupName} monopoly ${ownerStatus}\n`;
        });
      }
      monopoliesText += "\n";

      // --- Format History ---
      let historyText = "";
      if (gameState.gameHistory.length > 0) {
        historyText = "# Recent Game History (Last ~5 Turns):\n";
        // Show fewer turns to save context space
        gameState.gameHistory.slice(0, 5).forEach((turn, index) => {
          historyText += `T-${index}: ${turn.playerName} - ${turn.actions.join(", ")}\n`;
        });
        historyText += "\n";
      }
      
      // --- Format Available Actions ---
      let actionsText = "# Available Actions:\n";
      gameState.availableActions.forEach(action => {
        actionsText += `- ${action}\n`;
      });
      actionsText += "\n";
      
      // --- Format Jail Status ---
      let jailText = "";
      if (p.jail) {
        jailText = "# Jail Status:\n";
        jailText += `You are in jail. This is turn ${p.jailroll + 1} of 3 max.\n`;
        if (p.hasJailCard) {
          jailText += "You have a 'Get Out of Jail Free' card.\n";
        }
        jailText += "Available jail actions: " + gameState.availableActions.filter(a => ['rollDice', 'payJailFine', 'useJailCard'].includes(a)).join(', ') + ".\n\n";
      }
      
      // --- Format Current Position Info ---
      let positionText = "# Current Position:\n";
      positionText += `You are on ${gameState.currentSquare.name}.\n`;
      
      if (gameState.currentSquare.price > 0) {
        if (gameState.currentSquare.owner === 0) {
          positionText += `This property is UNOWNED and costs $${gameState.currentSquare.price}.\n`;
          if (p.money >= gameState.currentSquare.price) {
            positionText += "You have enough money to buy it.\n";
          } else {
            positionText += `You need $${gameState.currentSquare.price - p.money} more to buy it.\n`;
          }
        } else if (gameState.currentSquare.owner === p.index) {
          positionText += "You OWN this property.\n";
        } else {
          positionText += `This property is owned by ${player[gameState.currentSquare.owner].name}.\n`;
          if (!gameState.currentSquare.mortgage) {
            const rent = typeof gameState.currentSquare.currentRent === 'string' ? 
                         gameState.currentSquare.currentRent : `$${gameState.currentSquare.currentRent}`;
            positionText += `Rent due: ${rent}.\n`; // Rent calculation might happen before this context is built
          } else {
            positionText += "The property is mortgaged, so no rent is due.\n";
          }
        }
      }
      positionText += "\n";
      
      // --- Format Dice Roll Info ---
      let diceText = "";
      if (gameState.lastRoll) {
        diceText = "# Last Dice Roll:\n";
        diceText += `You rolled: ${gameState.lastRoll[0]} + ${gameState.lastRoll[1]} = ${gameState.lastRoll[0] + gameState.lastRoll[1]}\n`;
        if (gameState.lastRoll[0] === gameState.lastRoll[1]) {
          diceText += `DOUBLES! (This was double roll #${gameState.doubleCount} in a row).\n`;
          if (gameState.doubleCount < 3) {
              diceText += "You MUST roll again.\n";
          } else {
              diceText += "Going to JAIL!\n";
          }
        }
        diceText += "\n";
      }
      
      // --- Combine Context ---
      const combinedText = `# Your Turn: ${p.name} ($${p.money})
Asset Value: ~$${p.totalAssetValue}
${p.hasJailCard ? 'Has Get Out of Jail Card\n' : ''}` +
        positionText +
        diceText +
        jailText +
        propertiesText +
        monopoliesText +
        playersText +
        historyText +
        actionsText;
      
      // Log context for debugging
      // console.log("LLM Context:", combinedText);

      return combinedText;
    };
  
    // Get monopoly rules text
    this.getMonopolyRules = function() {
      return `# Monopoly Rules Reference
  
  ## Core Gameplay:
  - Roll dice to move around the board.
  - When you land on an unowned property, you can buy it.
  - If you roll doubles, you take another turn. Three doubles in a row sends you to Jail.
  - Collect $200 when passing GO.
  
  ## Properties:
  - Properties are grouped by color sets.
  - Owning a complete color set (monopoly) allows building houses.
  - Rent increases significantly with monopolies and houses.
  - Houses must be built evenly across properties in a set.
  - You cannot build houses if any property in the set is mortgaged.
  
  ## Railroads and Utilities:
  - Railroads: Rent increases with each railroad owned ($25, $50, $100, $200).
  - Utilities: Rent is based on dice roll (4× or 10× if you own both).
  
  ## Money Management:
  - You can mortgage properties for 50% of their purchase price.
  - Unmortgaging costs 55% of the purchase price.
  - If you run out of money, you must sell houses or mortgage properties.
  - If you cannot pay a debt, you go bankrupt and are out of the game.
  
  ## Jail:
  - You go to Jail if you land on "Go to Jail", roll three doubles, or draw a certain card.
  - To get out: roll doubles, pay $50, or use a "Get Out of Jail Free" card.
  - You must leave jail after three turns by paying $50.
  
  ## Strategic Tips:
  - Orange and red properties are landed on most frequently.
  - Building to 3 houses often gives the best return on investment.
  - Railroads provide stable income.
  - Cash reserves are important for unexpected expenses.
  - Completing monopolies should be a priority.`;
    };
  
    // Helper function to get a color group name
    function getGroupName(groupNumber) {
      const groupNames = {
        1: "Railroad",
        2: "Utility",
        3: "Purple",
        4: "Light Blue",
        5: "Pink", 
        6: "Orange",
        7: "Red",
        8: "Yellow",
        9: "Green",
        10: "Dark Blue"
      };
      
      return groupNames[groupNumber] || "Unknown";
    }
  
    // --- Helper function to log to the UI panel ---
    function logToLLMPanel(type, data) {
      // Since we've hidden the LLM log panel, we don't need to update it
      // But we'll keep this function to avoid breaking code that calls it
      
      // Just log to console instead for debugging purposes
      console.log(`LLM ${type}:`, data);
      
      // Check for content to relay to the main game alert panel
      if (type === 'Response' && data.content && data.content.trim() !== '') {
        // No need to do anything special here - addAlert is called elsewhere
      }
      
      // For tool calls, make sure they're visible in the game alert panel
      if (type === 'Response' && data.tool_calls && data.tool_calls.length > 0) {
        // The calls to addToolCallAlert are handled elsewhere
      }
    }

    // Helper to escape HTML characters for safe display
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
           try {
             // Convert non-strings (like objects from tool args) to string representation
             unsafe = JSON.stringify(unsafe, null, 2) || ''; // Pretty print JSON
           } catch (e) {
             unsafe = '[Unserializable Content]';
           }
        }
        // Basic HTML escaping
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }
  
    // Make API call to LLM
    this.getNextAction = function() {
      return new Promise((resolve, reject) => {
        if (this.isProcessing) {
          reject(new Error("Already processing"));
          return;
        }
        
        this.isProcessing = true;
        
        // If we have actions queued up, use those first
        if (this.actionQueue.length > 0) {
          const nextAction = this.actionQueue.shift();
          this.isProcessing = false;
          resolve(nextAction);
          return;
        }
        
        const context = this.buildContext();
        const rules = this.getMonopolyRules();
        
        // Prepare tools definition
        const tools = [
          {
            type: "function",
            function: {
              name: "rollDice",
              description: "Roll the dice to move your token",
              parameters: { type: "object", properties: {}, required: [] }
            }
          },
          {
            type: "function",
            function: {
              name: "buyProperty",
              description: "Buy the property you landed on",
              parameters: { type: "object", properties: {}, required: [] }
            }
          },
          {
            type: "function",
            function: {
              name: "declineBuyProperty",
              description: "Decline to buy the property you landed on",
              parameters: { type: "object", properties: {}, required: [] }
            }
          },
          {
            type: "function",
            function: {
              name: "endTurn",
              description: "End your turn",
              parameters: { type: "object", properties: {}, required: [] }
            }
          },
          {
            type: "function",
            function: {
              name: "useJailCard",
              description: "Use your Get Out of Jail Free card",
              parameters: { type: "object", properties: {}, required: [] }
            }
          },
          {
            type: "function",
            function: {
              name: "payJailFine",
              description: "Pay $50 to get out of jail",
              parameters: { type: "object", properties: {}, required: [] }
            }
          },
          {
            type: "function",
            function: {
              name: "buyHouse",
              description: "Buy a house for a property",
              parameters: {
                type: "object",
                properties: {
                  propertyIndex: {
                    type: "integer",
                    description: "The index of the property (0-39)"
                  }
                },
                required: ["propertyIndex"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "sellHouse",
              description: "Sell a house from a property",
              parameters: {
                type: "object",
                properties: {
                  propertyIndex: {
                    type: "integer",
                    description: "The index of the property (0-39)"
                  }
                },
                required: ["propertyIndex"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "mortgage",
              description: "Mortgage a property",
              parameters: {
                type: "object",
                properties: {
                  propertyIndex: {
                    type: "integer",
                    description: "The index of the property (0-39)"
                  }
                },
                required: ["propertyIndex"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "unmortgage",
              description: "Unmortgage a property",
              parameters: {
                type: "object",
                properties: {
                  propertyIndex: {
                    type: "integer",
                    description: "The index of the property (0-39)"
                  }
                },
                required: ["propertyIndex"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "initiateTrade",
              description: "Initiate a trade with another player",
              parameters: {
                type: "object",
                properties: {
                  recipientIndex: {
                    type: "integer",
                    description: "The index of the player to trade with"
                  },
                  offerProperties: {
                    type: "array",
                    items: { type: "integer" },
                    description: "Indexes of properties to offer"
                  },
                  requestProperties: {
                    type: "array",
                    items: { type: "integer" },
                    description: "Indexes of properties to request"
                  },
                  offerMoney: {
                    type: "integer",
                    description: "Amount of money to offer"
                  },
                  requestMoney: {
                    type: "integer",
                    description: "Amount of money to request"
                  }
                },
                required: ["recipientIndex", "offerProperties", "requestProperties", "offerMoney", "requestMoney"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "respondToTrade",
              description: "Accept or reject a trade offer",
              parameters: {
                type: "object",
                properties: {
                  accept: {
                    type: "boolean",
                    description: "True to accept, false to reject"
                  }
                },
                required: ["accept"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "placeBid",
              description: "Place a bid in an auction",
              parameters: {
                type: "object",
                properties: {
                  amount: {
                    type: "integer",
                    description: "Bid amount"
                  }
                },
                required: ["amount"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "passBid",
              description: "Pass on bidding in this round of the auction",
              parameters: { type: "object", properties: {}, required: [] }
            }
          },
          {
            type: "function",
            function: {
              name: "exitAuction",
              description: "Exit the auction entirely",
              parameters: { type: "object", properties: {}, required: [] }
            }
          }
        ];
        
        // Prepare the request
        const systemPrompt = `You are playing a game of Monopoly. Your goal is to make the best strategic decisions to win the game.\n\n  ${rules}\n\n  You MUST use the provided tools to interact with the game. Think step-by-step about your decision, considering:\n  1. Your current position and financial situation.\n  2. Available properties and your development strategy (monopolies are key!).\n  3. Other players\' positions and properties.\n  4. Risk management and cash flow.\n\n  **Turn Flow Rules:**\n  *   At the start of your turn (if not in jail), your only valid action is \`rollDice\`.\n  *   If you roll doubles, you MUST call \`rollDice\` again (unless it's the 3rd double).\n  *   If you did NOT roll doubles, after handling the landing square (e.g., paying rent, choosing to buy/auction), you MUST call \`endTurn\` to finish.\n  *   Management actions (\`buyHouse\`, \`sellHouse\`, \`mortgage\`, \`unmortgage\`, \`initiateTrade\`) can generally be performed BEFORE rolling or AFTER rolling if your turn is not ending due to doubles, but they DO NOT replace the need to eventually call \`rollDice\` or \`endTurn\` to progress the turn.\n\n  Always provide a brief explanation of your reasoning before calling a tool.`;
        
        // *** Log the prompt before sending ***
        logToLLMPanel('Prompt', { system: systemPrompt, user: context });

        // Make the API call
        this.openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: context }
          ],
          tool_choice: "auto",
          tools: tools,
          max_tokens: 4000
        }).then(response => {
          this.isProcessing = false;
          
          if (response.choices && response.choices.length > 0) {
            const message = response.choices[0].message;
            
            // *** Log the response ***
            logToLLMPanel('Response', message);

            // Display LLM reasoning if available
            if (message.content) {
              console.log("LLM reasoning:", message.content);
              addAlert("LLM: " + message.content, 'llm-thinking'); // Add reasoning to game alerts with type
            }
            
            // Check if the LLM called a tool
            if (message.tool_calls && message.tool_calls.length > 0) {
              // Handle multiple tool calls if needed (e.g., mortgage then pay)
              // For now, assume the first tool call is the primary action
              const toolCall = message.tool_calls[0];
              const functionName = toolCall.function.name;
              let args = {};
              
              try {
                // Make sure arguments is a string before parsing
                if (typeof toolCall.function.arguments === 'string') {
                   args = JSON.parse(toolCall.function.arguments);
                   // Display the tool call in the alert panel
                   addToolCallAlert(functionName, args);
                } else {
                    console.warn("Tool arguments were not a string:", toolCall.function.arguments);
                    args = toolCall.function.arguments || {}; // Use as is if already an object
                    // Display the tool call in the alert panel
                    addToolCallAlert(functionName, args);
                }
              } catch (e) {
                console.error("Failed to parse tool arguments:", e, toolCall.function.arguments);
                // Display raw tool call in case of parsing error
                addAlert(`Tool call: ${functionName}(${toolCall.function.arguments})`, 'llm-tool-call');
                // Default to endTurn on parsing error
                resolve({ name: "endTurn", args: {} });
                return;
              }
              
              // Format the action for execution
              const action = {
                name: functionName,
                args: args
              };
              
              resolve(action);
            } else {
              // If no tool was called, maybe LLM just commented. End turn.
              console.log("LLM provided text but no tool call.");
              addAlert("LLM decided to end the turn.", 'llm-thinking'); // Inform user with type
              resolve({ name: "endTurn", args: {} });
            }
          } else {
            console.error("Invalid API response structure (no choices):", response);
            logToLLMPanel('Error', { message: "Invalid API response (no choices)", response });
            addAlert("Error: Invalid response from LLM. Ending turn.", 'game-alert');
            reject(new Error("Invalid API response"));
          }
        }).catch(error => {
          this.isProcessing = false;
          console.error("API error in getNextAction:", error);
          logToLLMPanel('Error', { message: "API Error", error: error.message || error });
          addAlert("Error: Could not get decision from LLM. Ending turn.", 'game-alert');
          
          // Default to a safe action on error
          resolve({ name: "endTurn", args: {} });
        });
      });
    };
  
    // Execute the LLM's chosen action
    this.executeAction = async function(action) {
      console.log("Executing action:", action);
      let actionResult = false;
      let requiresFollowUp = false;
      const potentiallyRequiresFollowUp = [
        "buyProperty", "declineBuyProperty", "buyHouse", "sellHouse", "mortgage", "unmortgage", "payJailFine", "useJailCard"
        // rollDice handles its own follow-up via doublecount
        // initiateTrade/respondToTrade might need special handling depending on game flow
        // placeBid/passBid/exitAuction are handled by the auction loop
      ];

      try {
        switch(action.name) {
          case "rollDice":
            actionResult = llmTools.rollDice();
            // Roll dice handles its own flow (doubles, jail, etc.)
            break;
            
          case "buyProperty":
            actionResult = llmTools.buyProperty();
            requiresFollowUp = true;
            break;
            
          case "declineBuyProperty":
            actionResult = llmTools.declineBuyProperty();
            requiresFollowUp = true; // Auction will start, but then turn should end
            break;
            
          case "endTurn":
            actionResult = llmTools.endTurn();
            break;
            
          case "useJailCard":
            actionResult = llmTools.useJailCard();
            requiresFollowUp = true; // Need to roll after using card
            break;
            
          case "payJailFine":
            actionResult = llmTools.payJailFine();
            requiresFollowUp = true; // Need to roll after paying fine
            break;
            
          case "buyHouse":
            console.log("[buyHouse] Calling llmTools.buyHouse with propertyIndex:", action.args.propertyIndex);
            actionResult = llmTools.buyHouse(action.args.propertyIndex);
            console.log("[buyHouse] Result:", actionResult);
            requiresFollowUp = true;
            break;
            
          case "sellHouse":
            actionResult = llmTools.sellHouse(action.args.propertyIndex);
            requiresFollowUp = true;
            break;
            
          case "mortgage":
            actionResult = llmTools.mortgage(action.args.propertyIndex);
            requiresFollowUp = true;
            break;
            
          case "unmortgage":
            actionResult = llmTools.unmortgage(action.args.propertyIndex);
            requiresFollowUp = true;
            break;
            
          case "initiateTrade":
            actionResult = llmTools.initiateTrade(
              action.args.recipientIndex,
              action.args.offerProperties || [],
              action.args.requestProperties || [],
              action.args.offerMoney || 0,
              action.args.requestMoney || 0
            );
            // Trade flow might need separate handling
            break;
            
          case "respondToTrade":
            actionResult = llmTools.respondToTrade(action.args.accept);
            // Trade flow might need separate handling
            break;
            
          case "placeBid":
            actionResult = llmTools.placeBid(action.args.amount);
            // Auction loop handles next step
            break;
            
          case "passBid":
            actionResult = llmTools.passBid();
            // Auction loop handles next step
            break;
            
          case "exitAuction":
            actionResult = llmTools.exitAuction();
            // Auction loop handles next step
            break;
            
          default:
            console.error("Unknown action:", action.name);
            actionResult = false;
        }

        // If the action was successful and requires a follow-up
        if (actionResult && requiresFollowUp) {
            console.log(`[Follow-up Check] Action '${action.name}' succeeded. Checking available actions...`);
            const available = llmTools.getAvailableActions(); // Use llmTools accessor to ensure correct path
            console.log(`[Follow-up Check] Available actions after '${action.name}':`, available);
            
            // Check if a core turn progression action is needed (roll again or end turn)
            const needsTurnProgression = available.includes("rollDice") || available.includes("endTurn");
            console.log(`[Follow-up Check] Needs turn progression (rollDice or endTurn available)?`, needsTurnProgression);

            if (needsTurnProgression) {
                 console.log(`[Follow-up Action] Turn progression needed. Getting next action from LLM...`);
                 addAlert("LLM deciding next step...", 'llm-thinking');
                 try {
                     const nextAction = await this.getNextAction();
                     console.log("[Follow-up Action] Received follow-up action from LLM:", nextAction);
                     
                     // Execute the follow-up action ONLY if it's one of the core progression actions
                     if (available.includes(nextAction.name) && (nextAction.name === 'rollDice' || nextAction.name === 'endTurn')) {
                         console.log(`[Follow-up Action] Executing valid follow-up action: ${nextAction.name}`);
                         await this.executeAction(nextAction); 
                         console.log(`[Follow-up Action] Execution of ${nextAction.name} completed.`);
                     } else {
                         console.warn(`[Follow-up Fallback] Expected rollDice or endTurn, but got: ${nextAction.name}. Available: ${available.join(', ')}. Force ending turn.`);
                         addAlert(`LLM requested unexpected follow-up: ${nextAction.name}. Ending turn.`, 'game-alert');
                         llmTools.endTurn(); 
                         console.log("[Follow-up Fallback] Forced endTurn executed.");
                     }
                 } catch (error) {
                      console.error("[Follow-up Error] Error getting/executing follow-up action:", error);
                      addAlert("LLM Error during follow-up. Ending turn.", 'game-alert');
                      llmTools.endTurn(); 
                      console.log("[Follow-up Error] Forced endTurn executed due to error.");
                 }
             } else {
                 console.log(`[Follow-up Skipped] Action (${action.name}) completed, no standard turn progression needed now. Available: ${available.join(', ')}`);
             }
        }
        else {
             if (!actionResult) console.log(`[Follow-up Check] Initial action '${action.name}' failed or returned false. No follow-up.`);
             if (!requiresFollowUp) console.log(`[Follow-up Check] Initial action '${action.name}' does not require follow-up.`);
        }

      } catch (error) {
        console.error("Error executing action:", error);
        // Optionally end turn on error? Or let it retry?
        // llmTools.endTurn(); 
        return false; // Indicate action failed
      }
      return actionResult;
    };
  
    // Required AI interface methods for the game
  
    // Decide whether to buy a property the LLM landed on
    this.buyProperty = function(index) {
      // The actual decision is made through the getNextAction/executeAction flow when onLand is called.
      // This function might not be strictly necessary if onLand handles it.
      // For safety, we'll return false, assuming the LLM will call buyProperty tool if desired.
      console.log("LLMPlayer.buyProperty called - decision deferred to getNextAction.");
      return false;
    };
  
    // Determine the response to an offered trade
    this.acceptTrade = function(tradeObj) {
      // The decision to accept/reject MUST come from the LLM via getNextAction/executeAction.
      // This function is called by the core game logic when a trade is proposed TO the LLM.
      // We need to trigger the LLM to respond.
      console.log("LLMPlayer.acceptTrade called - LLM will be prompted to respond.");
      // Triggering the LLM response might happen automatically if it's the LLM's turn to respond.
      // If not, the game logic might need adjustment to wait for the LLM.
      // Returning a default value here is problematic. The game expects an immediate boolean or tradeObj.
      // For now, return false as a placeholder, acknowledging this might need game logic changes.
      return false; // Placeholder - LLM decision should override this.
    };
  
    // Actions before turn
    this.beforeTurn = async function() {
      console.log("LLMPlayer.beforeTurn called.");
      // Get action from LLM and execute it
      try {
        const action = await this.getNextAction();
        console.log("LLM action received (beforeTurn):", action);
        await this.executeAction(action);
      } catch (error) {
        console.error("Error in beforeTurn:", error);
        addAlert("LLM Error (beforeTurn). Ending turn.", 'game-alert');
        llmTools.endTurn(); // Ensure turn ends on error
      }
    };
  
    // Actions when landed on a square
    this.onLand = async function() {
      console.log("LLMPlayer.onLand called.");
      // Get action from LLM and execute it
      try {
         const action = await this.getNextAction();
         console.log("LLM action received (onLand):", action);
        await this.executeAction(action);
      } catch (error) {
        console.error("Error in onLand:", error);
        addAlert("LLM Error (onLand). Ending turn.", 'game-alert');
        llmTools.endTurn(); // Ensure turn ends on error
      }
    };
  
    // Determine whether to post bail
    this.postBail = function() {
      // Decision must come from LLM via getNextAction
      console.log("LLMPlayer.postBail called - decision deferred to getNextAction.");
      // The game logic calling this likely expects an immediate boolean.
      // Returning false, assuming the LLM will call payJailFine or useJailCard if desired.
      return false; // Placeholder - LLM decision should override this.
    };
  
    // Mortgage properties to pay debt
    this.payDebt = function() {
      // This function is called when player has negative money.
      // The LLM needs to be prompted to take actions (mortgage, sell houses)
      // until money >= 0 or they decide they are bankrupt.
      // Removing the hardcoded loop. The LLM should handle this via standard turn actions.
      console.log("LLMPlayer.payDebt called. LLM must handle raising funds via normal actions.");
      // The core game logic should re-check money status after the LLM turn.
      // No immediate action taken here; LLM decides during its turn prompted by negative money state.
    };
  
    // Determine what to bid during an auction
    this.bid = function(property, currentBid) {
      // Decision must come from LLM via getNextAction. Return a Promise.
      console.log(`LLMPlayer.bid called for property ${property}, current bid $${currentBid}. Requesting decision.`);

      return new Promise((resolve, reject) => {
        this.getNextAction().then(action => {
          if (action.name === "placeBid" && action.args && typeof action.args.amount === 'number') {
            console.log(`LLM decided to bid: $${action.args.amount}`);
            resolve(action.args.amount); // Resolve with bid amount
          } else if (action.name === "exitAuction") {
            console.log("LLM decided to exit auction.");
            resolve(-1); // Resolve with -1 for exit
          } else { // Includes passBid or fallback/error
            console.log("LLM decided to pass bid (or fallback/error).");
            resolve(0); // Resolve with 0 for pass
          }
        }).catch(error => {
          console.error("Error getting LLM bid decision:", error);
          addAlert("LLM Error: Failed to get bid decision. Passing.", 'game-alert');
          resolve(0); // Resolve with 0 (pass) on error
        });
      });
    };
  
    // OpenAI class for API calls
    function OpenAI(apiKey) {
      this.apiKey = apiKey;
      this.chat = {
         completions: {
              create: async (opts) => { // Make this async
                const url = 'https://api.openai.com/v1/chat/completions';
                try {
                    const response = await fetch(url, { // Use await
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        body: JSON.stringify(opts)
                    });
                    const data = await response.json(); // Use await
                    if (!response.ok || data.error) {
                        console.error("OpenAI API Error:", data.error || `HTTP ${response.status}`);
                        throw new Error(data.error ? data.error.message : `HTTP ${response.status}`);
                    }
                    return data;
                } catch (error) {
                    console.error("Fetch error calling OpenAI:", error);
                    // Rethrow or return a specific error structure
                    throw error;
                }
            }
         }
      };
    }
}
  
// Assign LLMPlayer to the global scope
window.LLMPlayer = LLMPlayer;