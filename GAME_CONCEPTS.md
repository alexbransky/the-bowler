# The Bowler - Game Concepts

This document records the core gameplay concepts and design assumptions so they are visible in the repository for any AI agents and contributors.

## Core Concept
- Mobile-first 2D scroller where the player climbs a sloped hill.
- The player character is **Carol the Bowler**, riding a scooter.
- The scooter keeps moving forward automatically along the slope (no jump ability).

## Throwing Mechanic
- The player throws a **pink bowling ball**.
- Throwing is controlled via a **pull-back drag mechanic** (similar to golf games):
  - Dragging backward from Carol aims.
  - Releasing throws the ball.

## Enemies
- Enemies march toward Carol along the slope.
- When hit by the ball, enemies **blink then disappear**.

## Win / Progress
- There is a **single level**.
- The goal is to reach the **top of the hill**.
- Progress is tracked as Carol climbs upward.

## Scoring
- Points are awarded for hitting enemies.
- The best score is saved locally (via `localStorage`).
