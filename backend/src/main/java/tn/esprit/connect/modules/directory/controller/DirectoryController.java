package tn.esprit.connect.modules.directory.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tn.esprit.connect.modules.directory.service.DirectoryService;
import tn.esprit.connect.modules.directory.dto.DirectorySearchResult;

import java.util.List;

@RestController
@RequestMapping("/api/v1/directory")
@RequiredArgsConstructor
@Tag(name = "Directory", description = "Search and discover people in the network")
public class DirectoryController {

    private final DirectoryService directoryService;

    @GetMapping("/search")
    @Operation(summary = "Search for people by name, headline, or skill")
    public ResponseEntity<List<DirectorySearchResult>> search(
            @RequestParam(required = true) String q,
            @RequestParam(defaultValue = "10") int limit) {
        return ResponseEntity.ok(directoryService.search(q, limit));
    }
}
