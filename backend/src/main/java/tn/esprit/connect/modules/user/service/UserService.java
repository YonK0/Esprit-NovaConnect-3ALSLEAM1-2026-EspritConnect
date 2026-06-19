package tn.esprit.connect.modules.user.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tn.esprit.connect.common.exception.ResourceNotFoundException;
import tn.esprit.connect.modules.user.dto.UserResponse;
import tn.esprit.connect.modules.user.entity.User;
import tn.esprit.connect.modules.user.entity.UserStatus;
import tn.esprit.connect.modules.user.mapper.UserMapper;
import tn.esprit.connect.modules.user.repository.UserRepository;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final UserMapper userMapper;

    @Transactional(readOnly = true)
    public UserResponse getById(UUID id) {
        return userMapper.toResponse(userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id)));
    }

    @Transactional(readOnly = true)
    public Page<UserResponse> list(Pageable pageable) {
        return userRepository.findAll(pageable).map(userMapper::toResponse);
    }

    @Transactional
    public UserResponse approve(UUID id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        u.setStatus(UserStatus.ACTIVE);
        return userMapper.toResponse(u);
    }

    @Transactional
    public UserResponse suspend(UUID id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        u.setStatus(UserStatus.SUSPENDED);
        return userMapper.toResponse(u);
    }

    @Transactional
    public void softDelete(UUID id) {
        User u = userRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User", id));
        u.setDeletedAt(Instant.now());
        u.setStatus(UserStatus.DELETED);
    }
}
