// LLM Tools for Monopoly Game
// This file defines the tools and game state tracking for LLM players

// History to track last 10 turns
const gameHistory = {
    turns: [],
    maxTurns: 10,
    
    addTurn: function(playerIndex, actions) {
      const turnData = {
        player: playerIndex,
        playerName: player[playerIndex].name,
        actions: actions,
        timestamp: new Date().toISOString()
      };
      
      this.turns.unshift(turnData); // Add to beginning
      
      // Keep only the last 10 turns
      if (this.turns.length > this.maxTurns) {
        this.turns.pop();
      }
    },
    
    getHistory: function() {
      return this.turns;
    },
    
    clear: function() {
      this.turns = [];
    }
  };
  
  // Define the tools for LLM to interact with the game
  const llmTools = {
    // Get comprehensive game state information
    getGameState: function() {
      const p = player[turn];
      
      // Get information about properties with complete monopolies
      const monopolies = findMonopolies();
      
      // Get detailed information about all players
      const playerDetails = [];
      for (let i = 1; i <= pcount; i++) {
        playerDetails.push(getDetailedPlayerInfo(i));
      }
      
      return {
        currentPlayer: getDetailedPlayerInfo(turn),
        currentSquare: getDetailedSquareInfo(p.position),
        diceRolled: game.getAreDiceRolled(),
        lastRoll: game.getAreDiceRolled() ? [game.getDie(1), game.getDie(2)] : null,
        doubleCount: doublecount,
        availableActions: getAvailableActions(),
        playerDetails: playerDetails,
        monopolies: monopolies,
        gameHistory: gameHistory.getHistory()
      };
    },
    
    // Property actions
    buyProperty: function() {
      if (!isValidAction("buyProperty")) return false;
      
      const result = buy();
      if (result !== false) {
        gameHistory.addTurn(turn, ["Bought property: " + square[player[turn].position].name]);
      }
      return result;
    },
    
    declineBuyProperty: function() {
      if (!isValidAction("declineBuyProperty")) return false;
      
      // Player declined to buy, will trigger auction later
      gameHistory.addTurn(turn, ["Declined to buy property: " + square[player[turn].position].name]);
      $("#landed").hide();
      return true;
    },
    
    buyHouse: function(propertyIndex) {
      if (!isValidAction("buyHouse")) {
        console.warn(`[buyHouse Tool] Invalid action 'buyHouse', available actions:`, getAvailableActions());
        return false;
      }
      
      if (typeof propertyIndex !== 'number' || propertyIndex < 0 || propertyIndex >= 40) {
        console.error(`[buyHouse Tool] Invalid property index: ${propertyIndex}`);
        return false;
      }
      
      // Check if the property is owned by the current player
      if (square[propertyIndex].owner !== turn) {
        console.error(`[buyHouse Tool] Player ${turn} does not own property at index ${propertyIndex}`);
        return false;
      }

      console.log(`[buyHouse Tool] Calling buyHouse function with property: ${square[propertyIndex].name} (${propertyIndex})`);
      const result = buyHouse(propertyIndex);
      console.log(`[buyHouse Tool] Result from buyHouse: ${result}`);
      
      if (result !== false) {
        gameHistory.addTurn(turn, ["Bought house for property: " + square[propertyIndex].name]);
      }
      
      // After buying house, refresh available actions to ensure proper turn progression
      const available = getAvailableActions();
      console.log(`[buyHouse Tool] Available actions after house purchase:`, available);
      
      return result;
    },
    
    sellHouse: function(propertyIndex) {
      if (!isValidAction("sellHouse")) return false;
      
      const result = sellHouse(propertyIndex);
      if (result !== false) {
        gameHistory.addTurn(turn, ["Sold house for property: " + square[propertyIndex].name]);
      }
      return result;
    },
    
    mortgage: function(propertyIndex) {
      if (!isValidAction("mortgage")) return false;
      
      const result = mortgage(propertyIndex);
      if (result !== false) {
        gameHistory.addTurn(turn, ["Mortgaged property: " + square[propertyIndex].name]);
      }
      return result;
    },
    
    unmortgage: function(propertyIndex) {
      if (!isValidAction("unmortgage")) return false;
      
      const result = unmortgage(propertyIndex);
      if (result !== false) {
        gameHistory.addTurn(turn, ["Unmortgaged property: " + square[propertyIndex].name]);
      }
      return result;
    },
    
    // Movement actions
    rollDice: function() {
      if (!isValidAction("rollDice")) return false;
      
      roll();
      gameHistory.addTurn(turn, ["Rolled dice: " + game.getDie(1) + ", " + game.getDie(2)]);
      return true;
    },
    
    endTurn: function() {
      if (!isValidAction("endTurn")) return false;
      
      gameHistory.addTurn(turn, ["Ended turn"]);
      game.next();
      return true;
    },
    
    // Jail actions
    useJailCard: function() {
      if (!isValidAction("useJailCard")) return false;
      
      useJailCard();
      gameHistory.addTurn(turn, ["Used Get Out of Jail Free card"]);
      return true;
    },
    
    payJailFine: function() {
      if (!isValidAction("payJailFine")) return false;
      
      payfifty();
      gameHistory.addTurn(turn, ["Paid $50 jail fine"]);
      return true;
    },
    
    // Trading system
    initiateTrade: function(recipientIndex, offerProperties, requestProperties, offerMoney, requestMoney) {
      if (!isValidAction("initiateTrade")) return false;
      
      // Format trade properties array (40 length array with 1/-1/0 values)
      const properties = new Array(40).fill(0);
      
      // Mark offered properties with 1
      offerProperties.forEach(index => {
        properties[index] = 1;
      });
      
      // Mark requested properties with -1
      requestProperties.forEach(index => {
        properties[index] = -1;
      });
      
      // Calculate net money transfer (positive = offering, negative = requesting)
      const moneyDelta = offerMoney - requestMoney;
      
      // Create trade object
      const initiator = player[turn];
      const recipient = player[recipientIndex];
      const tradeObj = new Trade(initiator, recipient, moneyDelta, properties, 0, 0);
      
      // Initiate trade
      game.trade(tradeObj);
      
      gameHistory.addTurn(turn, ["Initiated trade with " + recipient.name]);
      return true;
    },
    
    respondToTrade: function(accept) {
      if (!isValidAction("respondToTrade")) return false;
      
      if (accept) {
        game.acceptTrade();
        gameHistory.addTurn(turn, ["Accepted trade offer"]);
      } else {
        game.cancelTrade();
        gameHistory.addTurn(turn, ["Rejected trade offer"]);
      }
      return true;
    },
    
    // Auction system
    placeBid: function(amount) {
      if (!isValidAction("placeBid")) return false;
      
      game.auctionBid(amount);
      gameHistory.addTurn(turn, ["Placed bid: $" + amount]);
      return true;
    },
    
    passBid: function() {
      if (!isValidAction("passBid")) return false;
      
      game.auctionPass();
      gameHistory.addTurn(turn, ["Passed on bidding"]);
      return true;
    },
    
    exitAuction: function() {
      if (!isValidAction("exitAuction")) return false;
      
      game.auctionExit();
      gameHistory.addTurn(turn, ["Exited auction"]);
      return true;
    },
    
    // Get property information
    getPropertyInfo: function(propertyIndex) {
      return getDetailedSquareInfo(propertyIndex);
    },
    
    // Get all properties for the current player
    getOwnedProperties: function() {
      const p = player[turn];
      const owned = [];
      
      for (let i = 0; i < 40; i++) {
        if (square[i].owner === turn) {
          owned.push(getDetailedSquareInfo(i));
        }
      }
      
      return owned;
    },
    
    // Get properties that can have houses built on them
    getBuildableProperties: function() {
      const monopolies = findMonopolies();
      const buildable = [];
      
      for (const group of monopolies) {
        if (group.groupNumber >= 3) { // Only color groups can have houses
          for (const propIndex of group.properties) {
            const sq = square[propIndex];
            if (sq.owner === turn && !sq.mortgage && sq.house < 5) {
              buildable.push(getDetailedSquareInfo(propIndex));
            }
          }
        }
      }
      
      return buildable;
    }
  };
  
  // Helper function to get detailed information about a player
  function getDetailedPlayerInfo(playerIndex) {
    const p = player[playerIndex];
    const propertiesByGroup = {}; // Store properties grouped by color
    const mortgagedProperties = []; // Keep separate list for mortgaged
    let totalPropertyValue = 0;
    let totalMortgageValue = 0;
    let totalHouseValue = 0;
    let buildableMonopolies = []; // Store groups ready for building
    
    // Group owned properties
    for (let i = 0; i < 40; i++) {
      const sq = square[i];
      if (sq.owner === playerIndex) {
        const propInfo = getDetailedSquareInfo(i); // Use detailed info
        
        if (sq.mortgage) {
          mortgagedProperties.push(propInfo);
          totalMortgageValue += propInfo.mortgageValue; 
        } else {
          // Group unmortgaged properties by color group number
          if (sq.groupNumber > 0) { // Exclude non-group squares like GO
            if (!propertiesByGroup[sq.groupNumber]) {
               propertiesByGroup[sq.groupNumber] = [];
            }
            propertiesByGroup[sq.groupNumber].push(propInfo);
            totalPropertyValue += sq.price; // Use original price for value
            totalHouseValue += (sq.house < 5 ? sq.house : 5) * sq.houseprice; // 5 houses = hotel
          }
        }
      }
    }

    // Check for buildable monopolies (complete, owned, unmortgaged groups)
    const allMonopolies = findMonopolies(); // Get all monopolies on the board
    allMonopolies.forEach(mono => {
        if (mono.owner === playerIndex) {
            // Check if all properties in this owned monopoly are unmortgaged
            let allUnmortgaged = true;
            for (const propIndex of mono.properties) {
                if (square[propIndex].mortgage) {
                    allUnmortgaged = false;
                    break;
                }
            }
            if (allUnmortgaged && mono.groupNumber >= 3) { // Only color sets are buildable
                buildableMonopolies.push(mono.groupNumber);
            }
        }
    });

    // Calculate total asset value
    let totalAssetValue = p.money + totalPropertyValue + totalMortgageValue + totalHouseValue;
    
    return {
      index: playerIndex,
      name: p.name,
      money: p.money,
      position: p.position,
      positionName: square[p.position].name, // Add position name
      jail: p.jail,
      jailroll: p.jailroll,
      isAI: !p.human && !p.isLLM,
      isLLM: !!p.isLLM,
      hasJailCard: p.communityChestJailCard || p.chanceJailCard,
      propertiesByGroup: propertiesByGroup, // Properties grouped by color
      mortgagedProperties: mortgagedProperties,
      buildableMonopolies: buildableMonopolies, // List of buildable group numbers
      totalPropertyValue: totalPropertyValue, // Value of unmortgaged properties
      totalMortgageValue: totalMortgageValue, // Value obtained from mortgaged properties
      totalHouseValue: totalHouseValue,
      totalAssetValue: totalAssetValue
    };
  }
  
  // Helper function to get detailed information about a square
  function getDetailedSquareInfo(squareIndex) {
    const sq = square[squareIndex];
    let rentValues = {};
    
    if (sq.groupNumber > 0) {
      if (sq.groupNumber >= 3) { // For properties
        rentValues = {
          baseRent: sq.baserent,
          monopolyRent: sq.baserent * 2,
          rent1House: sq.rent1,
          rent2Houses: sq.rent2, 
          rent3Houses: sq.rent3,
          rent4Houses: sq.rent4,
          rentHotel: sq.rent5
        };
      } else if (sq.groupNumber === 2) { // For utilities
        rentValues = {
          oneUtility: "4 × dice roll",
          twoUtilities: "10 × dice roll"
        };
      } else if (sq.groupNumber === 1) { // For railroads
        rentValues = {
          oneRailroad: 25,
          twoRailroads: 50,
          threeRailroads: 100,
          fourRailroads: 200
        };
      }
    }
    
    // Calculate monopoly status
    let inMonopoly = false;
    let allGroupOwned = true;
    let ownedBy = sq.owner;
    
    if (sq.groupNumber > 0 && sq.owner > 0) {
      for (let i = 0; i < 40; i++) {
        if (square[i].groupNumber === sq.groupNumber && square[i].owner !== sq.owner) {
          allGroupOwned = false;
          break;
        }
      }
      inMonopoly = allGroupOwned;
    }
    
    // Calculate current rent
    let currentRent = 0;
    if (sq.owner > 0 && !sq.mortgage) {
      if (sq.groupNumber === 1) { // Railroad
        let railroadCount = 0;
        for (let i = 5; i <= 35; i += 10) {
          if (square[i].owner === sq.owner) {
            railroadCount++;
          }
        }
        currentRent = 25 * Math.pow(2, railroadCount - 1);
      } else if (sq.groupNumber === 2) { // Utility
        let utilityCount = 0;
        if (square[12].owner === sq.owner) utilityCount++;
        if (square[28].owner === sq.owner) utilityCount++;
        
        if (utilityCount === 1) {
          currentRent = "4 × dice roll";
        } else {
          currentRent = "10 × dice roll";
        }
      } else if (sq.groupNumber >= 3) { // Regular property
        if (sq.house === 0) {
          currentRent = inMonopoly ? sq.baserent * 2 : sq.baserent;
        } else {
          currentRent = sq["rent" + sq.house];
        }
      }
    }
    
    return {
      index: squareIndex,
      name: sq.name,
      price: sq.price,
      color: sq.color,
      groupNumber: sq.groupNumber,
      owner: sq.owner,
      ownerName: sq.owner > 0 ? player[sq.owner].name : "Unowned",
      mortgage: sq.mortgage,
      houses: sq.house < 5 ? sq.house : 4,
      hotel: sq.house === 5 ? 1 : 0,
      houseprice: sq.houseprice,
      inMonopoly: inMonopoly,
      rentValues: rentValues,
      currentRent: currentRent,
      mortgageValue: Math.round(sq.price * 0.5),
      unmortgageValue: Math.round(sq.price * 0.55)
    };
  }
  
  // Helper function to find monopolies in the game
  function findMonopolies() {
    const monopolies = [];
    const groups = {};
    
    // Initialize groups
    for (let i = 1; i <= 10; i++) {
      groups[i] = {
        groupNumber: i,
        properties: [],
        owners: new Set()
      };
    }
    
    // Populate groups
    for (let i = 0; i < 40; i++) {
      const sq = square[i];
      if (sq.groupNumber > 0) {
        groups[sq.groupNumber].properties.push(i);
        if (sq.owner > 0) {
          groups[sq.groupNumber].owners.add(sq.owner);
        }
      }
    }
    
    // Find monopolies
    for (let i = 1; i <= 10; i++) {
      if (groups[i].owners.size === 1 && groups[i].owners.has(0) === false) {
        const owner = Array.from(groups[i].owners)[0];
        monopolies.push({
          groupNumber: i,
          properties: groups[i].properties,
          owner: owner,
          ownerName: player[owner].name
        });
      }
    }
    
    return monopolies;
  }
  
  // Helper function to determine available actions based on game state
  function getAvailableActions() {
    const p = player[turn];
    const s = square[p.position];
    const actions = [];
    const diceHaveBeenRolled = game.getAreDiceRolled();

    // --- Core Turn Flow --- 
    if (!diceHaveBeenRolled && !p.jail) {
      // Start of turn, not in jail: Can only roll dice
      actions.push("rollDice");
    } else if (diceHaveBeenRolled && !p.jail) {
        // Dice have been rolled, not in jail
        if (doublecount > 0 && doublecount < 3) {
            // Rolled doubles (1st or 2nd time): Must roll again
            actions.push("rollDice"); 
        } else {
            // Did not roll doubles, or rolled 3rd double (handled by roll() function sending to jail)
            // Turn should end after other actions are considered/taken.
            actions.push("endTurn");
        }
    } else if (p.jail && !diceHaveBeenRolled) {
        // Start of turn, in jail: Can try to get out
        actions.push("rollDice"); // Try rolling for doubles
        if (p.money >= 50) {
            actions.push("payJailFine");
        }
        if (p.communityChestJailCard || p.chanceJailCard) {
            actions.push("useJailCard");
        }
        // Note: If jailroll === 3, player MUST pay or use card if they fail the roll.
        // The LLM needs to know this context. The 'rollDice' here is the attempt.
        // If the roll fails on the 3rd turn, the game forces payment currently.
        // We might need to adjust the prompt or state to make this clearer.
    } else if (p.jail && diceHaveBeenRolled) {
        // In jail, just attempted roll (and failed, otherwise would be out)
        // Turn ends automatically if it was the 3rd roll attempt.
        // If < 3rd roll, turn should end.
        if (p.jailroll < 3) { 
             actions.push("endTurn");
        } // Otherwise, game logic likely forces payment/card use and then allows roll.
    }

    // --- Actions Available After Landing (if applicable) ---
    if (diceHaveBeenRolled && !p.jail) {
        // Property interactions (only possible immediately after landing)
        if (s.price > 0 && s.owner === 0) {
          actions.push("buyProperty");
          actions.push("declineBuyProperty");
        }
    }

    // --- Management Actions (Generally available when turn control is with player) ---
    // Available if not in jail, and either before rolling or after rolling (but not mandatory roll again)
    if (!p.jail && (!diceHaveBeenRolled || (diceHaveBeenRolled && doublecount === 0))) {
      let canManage = false;
      for(let i=0; i<40; ++i) {
          if (square[i].owner === turn) {
              // Basic check: does player own *any* property?
              canManage = true; 
              break;
          }
      }
  
      if (canManage) {
          // Add management tools - LLM needs to check validity based on context
          actions.push("buyHouse"); 
          actions.push("sellHouse");
          actions.push("mortgage");
          actions.push("unmortgage");
          actions.push("initiateTrade");
      }
    }
    
    // --- Auction/Trade Responses --- (These depend on popups/game state not fully captured here)
    // TODO: Enhance game state detection for auctions/trades if needed

    // Remove duplicates (though logic should prevent it now)
    return [...new Set(actions)]; 
  }
  
  // Validate if an action is currently allowed
  function isValidAction(action) {
    const availableActions = getAvailableActions();
    return availableActions.includes(action);
  }
  
  // --- Module Export ---
  // Export the tools
  window.llmTools = llmTools;
  window.gameHistory = gameHistory;
  
  // Also expose getAvailableActions through the llmTools object
  llmTools.getAvailableActions = getAvailableActions;